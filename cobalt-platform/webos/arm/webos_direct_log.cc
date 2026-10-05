#include "webos_direct_log.h"
#include <algorithm>
#include <cerrno>
#include <cstdio>
#include <utility>
#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>

namespace starboard { namespace shared { namespace webos {
namespace {
int OpenLog(const std::string& path, int flags) {
  return open(path.c_str(), flags | O_CLOEXEC | O_NOFOLLOW | O_NONBLOCK, 0600);
}
bool WriteAt(int fd, const char* bytes, size_t size, off_t offset) {
  while (size) {
    const ssize_t count = pwrite(fd, bytes, size, offset);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) return false;
    size -= count; bytes += count; offset += count;
  }
  return true;
}
}
bool TrimWebOsLogBeforeStartup(const std::string& path, off_t retained_bytes) {
  if (retained_bytes <= 0) return false;
  const int fd = OpenLog(path, O_RDWR);
  if (fd < 0) return errno == ENOENT;
  struct stat info;
  bool ok = fstat(fd, &info) == 0 && S_ISREG(info.st_mode);
  if (ok && info.st_size > retained_bytes) {
    char buffer[64 * 1024];
    const off_t start = info.st_size - retained_bytes;
    off_t copied = 0;
    while (ok && copied < retained_bytes) {
      const size_t chunk = static_cast<size_t>(std::min<off_t>(sizeof(buffer), retained_bytes - copied));
      const ssize_t count = pread(fd, buffer, chunk, start + copied);
      if (count < 0 && errno == EINTR) continue;
      ok = count > 0 && WriteAt(fd, buffer, static_cast<size_t>(count), copied);
      if (ok) copied += count;
    }
    if (ok) ok = ftruncate(fd, retained_bytes) == 0;
  }
  close(fd);
  return ok;
}
WebOsDirectLog::WebOsDirectLog(std::string path, off_t segment_bytes)
    : path_(std::move(path)), segment_bytes_(segment_bytes) {}
WebOsDirectLog::~WebOsDirectLog() { if (fd_ >= 0) close(fd_); }
bool WebOsDirectLog::Redirect(int new_fd) {
  const int saved_first = fcntl(first_fd_, F_DUPFD_CLOEXEC, 3);
  if (saved_first < 0) return false;
  const int saved_second = fcntl(second_fd_, F_DUPFD_CLOEXEC, 3);
  if (saved_second < 0) { close(saved_first); return false; }
  const bool ok = dup2(new_fd, first_fd_) >= 0 && dup2(new_fd, second_fd_) >= 0;
  if (!ok) { dup2(saved_first, first_fd_); dup2(saved_second, second_fd_); }
  close(saved_first); close(saved_second);
  return ok;
}
bool WebOsDirectLog::Initialize(int first_fd, int second_fd) {
  if (fd_ >= 0 || segment_bytes_ <= 0 || first_fd == second_fd) return false;
  first_fd_ = first_fd; second_fd_ = second_fd;
  // Previous runs have no writers in this process yet, so startup trimming is
  // safe. Runtime rotation below never truncates either output descriptor.
  if (!TrimWebOsLogBeforeStartup(path_ + ".previous", segment_bytes_) ||
      !TrimWebOsLogBeforeStartup(path_, segment_bytes_)) return false;
  const int fd = OpenLog(path_, O_WRONLY | O_CREAT | O_APPEND);
  if (fd < 0) return false;
  struct stat info;
  if (fstat(fd, &info) != 0 || !S_ISREG(info.st_mode) || !Redirect(fd)) {
    close(fd); return false;
  }
  fd_ = fd;
  return true;
}
bool WebOsDirectLog::RotateIfNeeded() {
  struct stat info;
  if (fd_ < 0 || fstat(fd_, &info) != 0) return false;
  if (info.st_size < segment_bytes_) return true;
  const std::string next = path_ + ".next", previous = path_ + ".previous";
  // The temporary file is private to this package's process; discard only an
  // abandoned temporary file from a previous run.
  unlink(next.c_str());
  const int fd = OpenLog(next, O_WRONLY | O_CREAT | O_EXCL | O_APPEND);
  if (fd < 0) return false;
  if (rename(path_.c_str(), previous.c_str()) != 0) { close(fd); unlink(next.c_str()); return false; }
  if (rename(next.c_str(), path_.c_str()) != 0) {
    rename(previous.c_str(), path_.c_str()); close(fd); unlink(next.c_str()); return false;
  }
  if (!Redirect(fd)) {
    // Keep the old descriptors' file reachable on failure.
    unlink(path_.c_str()); rename(previous.c_str(), path_.c_str()); close(fd); return false;
  }
  close(fd_); fd_ = fd;
  return true;
}
}}}

#include "webos_direct_log.h"
#include <cassert>
#include <cstdio>
#include <fstream>
#include <fcntl.h>
#include <string>
#include <thread>
#include <sys/stat.h>
#include <unistd.h>

using starboard::shared::webos::WebOsDirectLog;
using starboard::shared::webos::TrimWebOsLogBeforeStartup;
namespace {
std::string Read(const std::string& path) {
  std::ifstream file(path); return std::string(std::istreambuf_iterator<char>(file), {});
}
void Write(int fd, const std::string& value) {
  size_t done = 0;
  while (done < value.size()) {
    const ssize_t count = write(fd, value.data() + done, value.size() - done);
    assert(count > 0); done += count;
  }
}
}
int main() {
  char directory[] = "/tmp/ytaf-log-test-XXXXXX";
  assert(mkdtemp(directory));
  const std::string path = std::string(directory) + "/log";
  const std::string tail(150000, 't');
  { std::ofstream file(path); file << std::string(170000, 'x') << tail; }
  assert(TrimWebOsLogBeforeStartup(path, tail.size()));
  assert(Read(path) == tail);
  assert(!TrimWebOsLogBeforeStartup(path, 0));
  unlink(path.c_str());
  const int first = open("/dev/null", O_WRONLY), second = open("/dev/null", O_WRONLY);
  assert(first >= 0 && second >= 0);
  {
    WebOsDirectLog log(path, 1024);
    assert(log.Initialize(first, second));
    struct stat info; assert(stat(path.c_str(), &info) == 0 && (info.st_mode & 0777) == 0600);
    assert(!log.Initialize(first, second));
    Write(first, std::string(1024, 'a'));
    // Represents a raw writer already holding the old descriptor when rotation
    // begins. It must retain its bytes in the previous file after redirection.
    const int in_flight = dup(second); assert(in_flight >= 0);
    assert(log.RotateIfNeeded());
    Write(in_flight, "in-flight\n"); close(in_flight);
    Write(first, "new-output\n"); Write(second, "new-error\n");
    assert(Read(path + ".previous") == std::string(1024, 'a') + "in-flight\n");
    assert(Read(path) == "new-output\nnew-error\n");
    assert(log.RotateIfNeeded()); // Below budget does not rotate.
    assert(Read(path + ".previous").find("in-flight") != std::string::npos);
    // Raw native writes continue during rotation. Each line must survive in
    // either segment; no in-place truncation can lose the concurrent tail.
    Write(first, std::string(1024, 'b'));
    std::thread writer([&]() { for (int i = 0; i < 300; ++i) Write(second, "raw-line\n"); });
    assert(log.RotateIfNeeded()); writer.join();
    const std::string all = Read(path + ".previous") + Read(path);
    size_t count = 0, at = 0;
    while ((at = all.find("raw-line\n", at)) != std::string::npos) { ++count; at += 9; }
    assert(count == 300);
    // A second rotation evicts only the old previous segment.
    Write(first, std::string(1024, 'c'));
    assert(log.RotateIfNeeded());
    assert(Read(path).empty());
  }
  // Failed setup keeps the existing descriptors usable.
  const std::string other = std::string(directory) + "/untouched";
  const int unchanged = open(other.c_str(), O_WRONLY | O_CREAT | O_TRUNC, 0600);
  { WebOsDirectLog log(path); assert(!log.Initialize(unchanged, -1)); }
  Write(unchanged, "still-open"); close(unchanged); assert(Read(other) == "still-open");
  close(first); close(second);
  unlink(path.c_str()); unlink((path + ".previous").c_str()); unlink(other.c_str()); rmdir(directory);
  std::puts("Direct logging, fixed-buffer startup trimming, in-flight/concurrent writes and failure fallback passed");
}

#ifndef STARBOARD_WEBOS_ARM_WEBOS_DIRECT_LOG_H_
#define STARBOARD_WEBOS_ARM_WEBOS_DIRECT_LOG_H_

#include <string>
#include <sys/types.h>

namespace starboard { namespace shared { namespace webos {

// One current and one previous segment. Raw write(2) callers bypass stdio;
// rotate whole files instead of copying/truncating a file they still write.
class WebOsDirectLog {
 public:
  explicit WebOsDirectLog(std::string path, off_t segment_bytes = 8 * 1024 * 1024);
  ~WebOsDirectLog();
  WebOsDirectLog(const WebOsDirectLog&) = delete;
  WebOsDirectLog& operator=(const WebOsDirectLog&) = delete;
  bool Initialize(int first_fd = 1, int second_fd = 2);
  bool RotateIfNeeded();
 private:
  bool Redirect(int new_fd);
  std::string path_;
  off_t segment_bytes_;
  int fd_ = -1, first_fd_ = -1, second_fd_ = -1;
};

// Only used before redirecting process output. Memory use stays at 64 KiB.
bool TrimWebOsLogBeforeStartup(const std::string& path, off_t retained_bytes);

}}}  // namespace starboard::shared::webos
#endif

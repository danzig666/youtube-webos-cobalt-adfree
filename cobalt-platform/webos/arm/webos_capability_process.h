#ifndef STARBOARD_WEBOS_ARM_WEBOS_CAPABILITY_PROCESS_H_
#define STARBOARD_WEBOS_ARM_WEBOS_CAPABILITY_PROCESS_H_
#include <chrono>
#include <cerrno>
#include <fcntl.h>
#include <poll.h>
#include <signal.h>
#include <spawn.h>
#include <string>
#include <sys/wait.h>
#include <unistd.h>
extern char** environ;
namespace starboard { namespace shared { namespace webos {
struct CapabilityProcessResult { std::string status; std::string output; };
// Fixed argv, no shell. Always reap the child, including after timeout/overflow.
inline CapabilityProcessResult RunCapabilityProcess(char* const argv[], int timeout_ms = 2500,
                                                    size_t limit = 16384) {
  int pipes[2];
  if (pipe2(pipes, O_CLOEXEC) != 0) return {"pipe-unavailable", ""};
  for (int& descriptor : pipes) {
    if (descriptor < 3) {
      const int replacement = fcntl(descriptor, F_DUPFD_CLOEXEC, 3);
      if (replacement < 0) { close(pipes[0]); close(pipes[1]); return {"pipe-unavailable", ""}; }
      close(descriptor); descriptor = replacement;
    }
  }
  posix_spawn_file_actions_t actions;
  posix_spawn_file_actions_init(&actions);
  posix_spawn_file_actions_adddup2(&actions, pipes[1], STDOUT_FILENO);
  posix_spawn_file_actions_addopen(&actions, STDIN_FILENO, "/dev/null", O_RDONLY, 0);
  posix_spawn_file_actions_addopen(&actions, STDERR_FILENO, "/dev/null", O_WRONLY, 0);
  posix_spawn_file_actions_addclose(&actions, pipes[0]);
  posix_spawn_file_actions_addclose(&actions, pipes[1]);
  pid_t child = -1;
  const int spawned = posix_spawn(&child, argv[0], &actions, nullptr, argv, environ);
  posix_spawn_file_actions_destroy(&actions);
  close(pipes[1]);
  if (spawned) { close(pipes[0]); return {spawned == ENOENT ? "unavailable" : "spawn-failed", ""}; }
  fcntl(pipes[0], F_SETFL, O_NONBLOCK);
  CapabilityProcessResult result{"ok", ""};
  const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(timeout_ms);
  int exit_status = 0; bool exited = false;
  for (;;) {
    char buffer[1024]; ssize_t count;
    while ((count = read(pipes[0], buffer, sizeof(buffer))) > 0) {
      if (result.output.size() + static_cast<size_t>(count) > limit) { result.status = "output-limit"; break; }
      result.output.append(buffer, static_cast<size_t>(count));
    }
    if (result.status != "ok") break;
    if (!exited) {
      const pid_t waited = waitpid(child, &exit_status, WNOHANG);
      exited = waited == child;
      if (waited < 0 && errno != EINTR) { result.status = "wait-failed"; break; }
    }
    if (exited && count == 0) break;
    if (std::chrono::steady_clock::now() >= deadline) { result.status = "timeout"; break; }
    pollfd descriptor{pipes[0], POLLIN, 0}; poll(&descriptor, 1, 20);
  }
  close(pipes[0]);
  if (!exited) { kill(child, SIGKILL); while (waitpid(child, &exit_status, 0) < 0 && errno == EINTR) {} }
  if (result.status == "ok" && WIFSIGNALED(exit_status)) result.status = "crashed";
  if (result.status == "ok" && (!WIFEXITED(exit_status) || WEXITSTATUS(exit_status) != 0)) result.status = "failed";
  if (result.status != "ok") result.output.clear();
  return result;
}
}}}
#endif

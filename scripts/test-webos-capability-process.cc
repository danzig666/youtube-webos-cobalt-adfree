#include "webos_capability_process.h"
#include <cassert>
#include <cstring>
#include <cstdio>
using starboard::shared::webos::RunCapabilityProcess;
int main(int argc, char** argv) {
  if (argc > 1) {
    if (!std::strcmp(argv[1], "closedfds")) {
      close(STDIN_FILENO); close(STDERR_FILENO);
      char* args[] = {argv[0], const_cast<char*>("ok"), nullptr};
      const auto result = RunCapabilityProcess(args, 250, 1024);
      assert(result.status == "ok" && result.output == "plain $(not-shell) output\n");
      return 0;
    }
    if (!std::strcmp(argv[1], "hang")) { for (;;) pause(); }
    if (!std::strcmp(argv[1], "overflow")) { for (int i=0; i<3000; ++i) std::puts("data"); return 0; }
    if (!std::strcmp(argv[1], "fail")) { std::puts("private failure body"); return 1; }
    std::puts("plain $(not-shell) output"); return 0;
  }
  char* ok[] = {argv[0], const_cast<char*>("ok"), nullptr};
  auto result = RunCapabilityProcess(ok, 250, 1024);
  assert(result.status == "ok" && result.output == "plain $(not-shell) output\n");
  char* closed[] = {argv[0], const_cast<char*>("closedfds"), nullptr};
  assert(RunCapabilityProcess(closed, 500).status == "ok");
  char* hang[] = {argv[0], const_cast<char*>("hang"), nullptr};
  assert(RunCapabilityProcess(hang, 60).status == "timeout");
  char* overflow[] = {argv[0], const_cast<char*>("overflow"), nullptr};
  result = RunCapabilityProcess(overflow, 250, 1024);
  assert(result.status == "output-limit" && result.output.empty());
  char* fail[] = {argv[0], const_cast<char*>("fail"), nullptr};
  result = RunCapabilityProcess(fail, 250);
  assert(result.status == "failed" && result.output.empty());
  char* missing[] = {const_cast<char*>("/no-such-capability-test-binary"), nullptr};
  assert(RunCapabilityProcess(missing).status == "unavailable");
  int status; assert(waitpid(-1, &status, WNOHANG) == -1 && errno == ECHILD);
  std::puts("Capability processes bounded, isolated, and reaped");
}

#include "webos_startup_timing.h"
#include <cassert>
#include <iostream>
#include <thread>
using namespace starboard::shared::webos;
int main() {
  StartupTimings state;
  state.Record(StartupStage::kProcessEntry, 0);
  state.Record(StartupStage::kSdlReady, 120);
  state.Record(StartupStage::kSdlReady, 9999);
  state.Record(StartupStage::kGraphicsReady, -1);
  state.Record(StartupStage::kCount, 100);
  const auto report = state.Report();
  assert(report.find("SDL ready: 120 ms") != std::string::npos);
  assert(report.find("9999") == std::string::npos);
  assert(report.find("Graphics ready: not reached") != std::string::npos);
  RecordStartupStage(StartupStage::kProcessEntry);
  std::thread first([] {RecordStartupStage(StartupStage::kLoggingReady);});
  std::thread second([] {RecordStartupStage(StartupStage::kSdlReady);});
  first.join(); second.join();
  assert(CopyStartupReport().find("Process entry: 0 ms") != std::string::npos);
  std::cout << "Bounded first-startup milestones and concurrent recording passed\n";
}

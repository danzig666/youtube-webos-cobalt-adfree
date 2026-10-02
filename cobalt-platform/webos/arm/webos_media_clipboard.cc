#include "webos_media_report.h"
#include "starboard/event.h"
#include <SDL2/SDL.h>
#include <atomic>
#include <memory>
namespace starboard { namespace shared { namespace webos {
namespace {
std::atomic<int> copy_status{0};
void CopyOnApplicationThread(void* context) {
  std::unique_ptr<std::string> report(static_cast<std::string*>(context));
  // Some Wayland implementations return success without providing selection.
  // Confirm a read-back before telling the user that copying succeeded.
  bool copied = SDL_SetClipboardText(report->c_str()) == 0;
  char* readback = copied ? SDL_GetClipboardText() : nullptr;
  copied = readback && *report == readback;
  SDL_free(readback);
  copy_status.store(copied ? 2 : 3);
}
}
void RequestMediaReportCopy() {
  int status = copy_status.load();
  if (status == 1 || !copy_status.compare_exchange_strong(status, 1)) return;
  auto* report = new std::string(CopyWebOsMediaReport());
  if (SbEventSchedule(CopyOnApplicationThread, report, 0) == kSbEventIdInvalid) {
    delete report; copy_status.store(3);
  }
}
int MediaReportCopyStatus() { return copy_status.load(); }
}}}

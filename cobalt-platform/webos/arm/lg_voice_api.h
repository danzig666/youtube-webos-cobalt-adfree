#ifndef STARBOARD_WEBOS_ARM_LG_VOICE_API_H_
#define STARBOARD_WEBOS_ARM_LG_VOICE_API_H_
#include <glib.h>
#include <luna-service2/lunaservice.h>
namespace starboard { namespace shared { namespace webos {
// Resolve libraries only when recording starts. No extra loader dependency or
// LS2 connection is introduced during ordinary Cobalt startup.
struct VoiceLibraryApi {
  VoiceLibraryApi();
  bool ready = false;
  decltype(&::g_main_context_new) g_main_context_new_fn = nullptr;
  decltype(&::g_main_context_push_thread_default) g_main_context_push_thread_default_fn = nullptr;
  decltype(&::g_main_context_pop_thread_default) g_main_context_pop_thread_default_fn = nullptr;
  decltype(&::g_main_context_ref) g_main_context_ref_fn = nullptr;
  decltype(&::g_main_context_unref) g_main_context_unref_fn = nullptr;
  decltype(&::g_main_loop_new) g_main_loop_new_fn = nullptr;
  decltype(&::g_main_loop_run) g_main_loop_run_fn = nullptr;
  decltype(&::g_main_loop_quit) g_main_loop_quit_fn = nullptr;
  decltype(&::g_main_loop_unref) g_main_loop_unref_fn = nullptr;
  decltype(&::g_idle_source_new) g_idle_source_new_fn = nullptr;
  decltype(&::g_timeout_source_new) g_timeout_source_new_fn = nullptr;
  decltype(&::g_source_set_callback) g_source_set_callback_fn = nullptr;
  decltype(&::g_source_attach) g_source_attach_fn = nullptr;
  decltype(&::g_source_unref) g_source_unref_fn = nullptr;
  decltype(&::g_source_destroy) g_source_destroy_fn = nullptr;
  decltype(&::LSCall) LSCall_fn = nullptr;
  decltype(&::LSCallOneReply) LSCallOneReply_fn = nullptr;
  decltype(&::LSCallCancel) LSCallCancel_fn = nullptr;
  decltype(&::LSErrorInit) LSErrorInit_fn = nullptr;
  decltype(&::LSErrorFree) LSErrorFree_fn = nullptr;
  decltype(&::LSMessageGetPayload) LSMessageGetPayload_fn = nullptr;
  decltype(&::LSGmainGetContext) LSGmainGetContext_fn = nullptr;
  void* glib = nullptr;
  void* luna = nullptr;
};
VoiceLibraryApi& VoiceApi();
}}}
#endif

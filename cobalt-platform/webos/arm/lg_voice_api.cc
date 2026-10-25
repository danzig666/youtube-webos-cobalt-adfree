#include "starboard/webos/arm/lg_voice_api.h"
#include <dlfcn.h>
namespace starboard { namespace shared { namespace webos {
VoiceLibraryApi::VoiceLibraryApi() {
  glib = dlopen("libglib-2.0.so.0", RTLD_NOW | RTLD_LOCAL);
  luna = dlopen("libluna-service2.so.3", RTLD_NOW | RTLD_LOCAL);
  if (!luna) luna = dlopen("libluna-service2.so", RTLD_NOW | RTLD_LOCAL);
  if (!glib) { failure = "GLib voice library unavailable"; return; }
  if (!luna) { failure = "LS2 voice library unavailable"; return; }
  g_main_context_new_fn = reinterpret_cast<decltype(g_main_context_new_fn)>(dlsym(glib, "g_main_context_new"));
  if (!g_main_context_new_fn) { failure = "Missing voice symbol: g_main_context_new"; return; }
  g_main_context_push_thread_default_fn = reinterpret_cast<decltype(g_main_context_push_thread_default_fn)>(dlsym(glib, "g_main_context_push_thread_default"));
  if (!g_main_context_push_thread_default_fn) { failure = "Missing voice symbol: g_main_context_push_thread_default"; return; }
  g_main_context_pop_thread_default_fn = reinterpret_cast<decltype(g_main_context_pop_thread_default_fn)>(dlsym(glib, "g_main_context_pop_thread_default"));
  if (!g_main_context_pop_thread_default_fn) { failure = "Missing voice symbol: g_main_context_pop_thread_default"; return; }
  g_main_context_ref_fn = reinterpret_cast<decltype(g_main_context_ref_fn)>(dlsym(glib, "g_main_context_ref"));
  if (!g_main_context_ref_fn) { failure = "Missing voice symbol: g_main_context_ref"; return; }
  g_main_context_unref_fn = reinterpret_cast<decltype(g_main_context_unref_fn)>(dlsym(glib, "g_main_context_unref"));
  if (!g_main_context_unref_fn) { failure = "Missing voice symbol: g_main_context_unref"; return; }
  g_main_loop_new_fn = reinterpret_cast<decltype(g_main_loop_new_fn)>(dlsym(glib, "g_main_loop_new"));
  if (!g_main_loop_new_fn) { failure = "Missing voice symbol: g_main_loop_new"; return; }
  g_main_loop_run_fn = reinterpret_cast<decltype(g_main_loop_run_fn)>(dlsym(glib, "g_main_loop_run"));
  if (!g_main_loop_run_fn) { failure = "Missing voice symbol: g_main_loop_run"; return; }
  g_main_loop_quit_fn = reinterpret_cast<decltype(g_main_loop_quit_fn)>(dlsym(glib, "g_main_loop_quit"));
  if (!g_main_loop_quit_fn) { failure = "Missing voice symbol: g_main_loop_quit"; return; }
  g_main_loop_unref_fn = reinterpret_cast<decltype(g_main_loop_unref_fn)>(dlsym(glib, "g_main_loop_unref"));
  if (!g_main_loop_unref_fn) { failure = "Missing voice symbol: g_main_loop_unref"; return; }
  g_idle_source_new_fn = reinterpret_cast<decltype(g_idle_source_new_fn)>(dlsym(glib, "g_idle_source_new"));
  if (!g_idle_source_new_fn) { failure = "Missing voice symbol: g_idle_source_new"; return; }
  g_timeout_source_new_fn = reinterpret_cast<decltype(g_timeout_source_new_fn)>(dlsym(glib, "g_timeout_source_new"));
  if (!g_timeout_source_new_fn) { failure = "Missing voice symbol: g_timeout_source_new"; return; }
  g_source_set_callback_fn = reinterpret_cast<decltype(g_source_set_callback_fn)>(dlsym(glib, "g_source_set_callback"));
  if (!g_source_set_callback_fn) { failure = "Missing voice symbol: g_source_set_callback"; return; }
  g_source_attach_fn = reinterpret_cast<decltype(g_source_attach_fn)>(dlsym(glib, "g_source_attach"));
  if (!g_source_attach_fn) { failure = "Missing voice symbol: g_source_attach"; return; }
  g_source_unref_fn = reinterpret_cast<decltype(g_source_unref_fn)>(dlsym(glib, "g_source_unref"));
  if (!g_source_unref_fn) { failure = "Missing voice symbol: g_source_unref"; return; }
  g_source_destroy_fn = reinterpret_cast<decltype(g_source_destroy_fn)>(dlsym(glib, "g_source_destroy"));
  if (!g_source_destroy_fn) { failure = "Missing voice symbol: g_source_destroy"; return; }
  LSCall_fn = reinterpret_cast<decltype(LSCall_fn)>(dlsym(luna, "LSCall"));
  if (!LSCall_fn) { failure = "Missing voice symbol: LSCall"; return; }
  LSCallOneReply_fn = reinterpret_cast<decltype(LSCallOneReply_fn)>(dlsym(luna, "LSCallOneReply"));
  if (!LSCallOneReply_fn) { failure = "Missing voice symbol: LSCallOneReply"; return; }
  LSCallCancel_fn = reinterpret_cast<decltype(LSCallCancel_fn)>(dlsym(luna, "LSCallCancel"));
  if (!LSCallCancel_fn) { failure = "Missing voice symbol: LSCallCancel"; return; }
  LSErrorInit_fn = reinterpret_cast<decltype(LSErrorInit_fn)>(dlsym(luna, "LSErrorInit"));
  if (!LSErrorInit_fn) { failure = "Missing voice symbol: LSErrorInit"; return; }
  LSErrorFree_fn = reinterpret_cast<decltype(LSErrorFree_fn)>(dlsym(luna, "LSErrorFree"));
  if (!LSErrorFree_fn) { failure = "Missing voice symbol: LSErrorFree"; return; }
  LSMessageGetPayload_fn = reinterpret_cast<decltype(LSMessageGetPayload_fn)>(dlsym(luna, "LSMessageGetPayload"));
  if (!LSMessageGetPayload_fn) { failure = "Missing voice symbol: LSMessageGetPayload"; return; }
  LSGmainGetContext_fn = reinterpret_cast<decltype(LSGmainGetContext_fn)>(dlsym(luna, "LSGmainGetContext"));
  if (!LSGmainGetContext_fn) { failure = "Missing voice symbol: LSGmainGetContext"; return; }
  ready = true;
  // Keep successful handles alive for the shared LS2 connection's lifetime.
}
VoiceLibraryApi& VoiceApi() { static VoiceLibraryApi api; return api; }
}}}

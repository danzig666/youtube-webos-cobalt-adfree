// Host boundary declarations for the Starboard 13 microphone API.
#ifndef YTAF_TEST_MICROPHONE_H_
#define YTAF_TEST_MICROPHONE_H_
struct SbMicrophoneIdPrivate;
struct SbMicrophonePrivate;
using SbMicrophoneId = SbMicrophoneIdPrivate*;
using SbMicrophone = SbMicrophonePrivate*;
constexpr SbMicrophone kSbMicrophoneInvalid = nullptr;
enum SbMicrophoneType { kSbMicrophoneUnknown = 4 };
struct SbMicrophoneInfo {
  SbMicrophoneId id;
  SbMicrophoneType type;
  int max_sample_rate_hz;
  int min_read_size;
  char label[256];
};
extern "C" {
int SbMicrophoneGetAvailable(SbMicrophoneInfo*, int);
bool SbMicrophoneIsSampleRateSupported(SbMicrophoneId, int);
SbMicrophone SbMicrophoneCreate(SbMicrophoneId, int, int);
bool SbMicrophoneOpen(SbMicrophone);
int SbMicrophoneRead(SbMicrophone, void*, int);
bool SbMicrophoneClose(SbMicrophone);
void SbMicrophoneDestroy(SbMicrophone);
}
#endif

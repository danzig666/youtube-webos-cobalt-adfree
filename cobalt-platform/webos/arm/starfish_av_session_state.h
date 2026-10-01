#ifndef STARBOARD_WEBOS_ARM_STARFISH_AV_SESSION_STATE_H_
#define STARBOARD_WEBOS_ARM_STARFISH_AV_SESSION_STATE_H_

#include <cstddef>
#include <cstdint>
#include <deque>
#include <limits>
#include <vector>

namespace starboard {
namespace shared {
namespace webos {

// Shared-session building blocks for the native webOS player.
// Deliberately independent of the firmware API so invariants can be host tested.
// Serialized owner-thread state. Native callbacks must marshal to that owner;
// this is not a mutex or a firmware callback-lifetime solution. Handle must own
// packet storage (e.g. scoped_refptr<InputBuffer>), not be a borrowed pointer.
// A feed ticket retains that storage even if Reset removes its queued copy.
template <typename Handle>
class StarfishAvSessionState {
 public:
  enum class Stream { kAudio, kVideo };
  enum class EnqueueResult { kAccepted, kFull, kInvalid, kClosed, kStale };
  enum class FeedResult { kAccepted, kRetry, kError };
  struct Limits {
    size_t packets;
    size_t bytes;
  };
  struct Packet {
    Handle buffer;
    size_t bytes;
    int64_t pts_us;
  };
  struct FeedTicket {
    uint64_t generation;
    Stream stream;
    uint64_t sequence;
    Packet packet;
  };

  StarfishAvSessionState(Limits audio, Limits video)
      : audio_limits_(audio), video_limits_(video) {}
  StarfishAvSessionState(const StarfishAvSessionState&) = delete;
  StarfishAvSessionState& operator=(const StarfishAvSessionState&) = delete;

  uint64_t generation() const { return generation_; }
  bool failed() const { return failed_; }
  bool ended() const { return ended_; }

  // One reset for BOTH streams. A delayed accepted Feed/EOS callback from the
  // old decoder must never consume packets or end playback in this generation.
  bool Reset() {
    if (generation_ == std::numeric_limits<uint64_t>::max()) {
      failed_ = true;
      return false;
    }
    ++generation_;
    audio_ = Queue{};
    video_ = Queue{};
    failed_ = eos_submitted_ = ended_ = false;
    return true;
  }

  // Atomic batch admission: never accept only half a Cobalt InputBuffers batch.
  // A packet larger than the entire budget is invalid, not retryable forever.
  EnqueueResult Enqueue(uint64_t generation, Stream stream,
                        const std::vector<Packet>& packets) {
    if (generation != generation_) return EnqueueResult::kStale;
    Queue& queue = Get(stream);
    if (failed_ || queue.eos) return EnqueueResult::kClosed;
    if (packets.empty()) return EnqueueResult::kInvalid;
    const Limits limits = stream == Stream::kAudio ? audio_limits_ : video_limits_;
    if (packets.size() > limits.packets) return EnqueueResult::kInvalid;
    size_t bytes = 0;
    for (const auto& packet : packets) {
      if (!packet.buffer || !packet.bytes || packet.bytes > limits.bytes - bytes)
        return EnqueueResult::kInvalid;
      bytes += packet.bytes;
    }
    if (packets.size() > limits.packets - queue.packets.size() ||
        bytes > limits.bytes - queue.bytes) return EnqueueResult::kFull;
    if (packets.size() > std::numeric_limits<uint64_t>::max() - queue.next_sequence)
      return EnqueueResult::kInvalid;
    for (const auto& packet : packets)
      queue.packets.push_back(Entry{++queue.next_sequence, packet});
    queue.bytes += bytes;
    return EnqueueResult::kAccepted;
  }

  // Get one ticket, issue one Feed, then CompleteFeed before feeding that
  // stream again. kRetry keeps exactly the same packet. Audio/video do not
  // share a head-of-line queue, so a full video buffer cannot starve audio.
  bool NextFeed(Stream stream, FeedTicket* ticket) const {
    const Queue& queue = Get(stream);
    if (!ticket || failed_ || queue.packets.empty()) return false;
    const Entry& entry = queue.packets.front();
    *ticket = FeedTicket{generation_, stream, entry.sequence, entry.packet};
    return true;
  }

  bool CompleteFeed(const FeedTicket& ticket, FeedResult result) {
    if (ticket.generation != generation_ || failed_) return false;
    Queue& queue = Get(ticket.stream);
    if (queue.packets.empty() || queue.packets.front().sequence != ticket.sequence)
      return false;
    if (result == FeedResult::kError) {
      failed_ = true;
    } else if (result == FeedResult::kAccepted) {
      queue.bytes -= queue.packets.front().packet.bytes;
      queue.packets.pop_front();
    }
    return true;
  }

  bool WriteEos(uint64_t generation, Stream stream) {
    if (generation != generation_ || failed_) return false;
    Get(stream).eos = true;
    return true;
  }
  bool ReadyToSubmitEos() const {
    return !failed_ && !eos_submitted_ && audio_.eos && video_.eos &&
           audio_.packets.empty() && video_.packets.empty();
  }
  bool EosSubmitted(uint64_t generation) {
    if (generation != generation_ || !ReadyToSubmitEos()) return false;
    eos_submitted_ = true;
    return true;
  }
  bool NativeEnded(uint64_t generation) {
    if (generation != generation_ || failed_ || !eos_submitted_ || ended_)
      return false;
    ended_ = true;
    return true;
  }
  size_t queued_bytes(Stream stream) const { return Get(stream).bytes; }
  size_t queued_packets(Stream stream) const { return Get(stream).packets.size(); }

 private:
  // Host regressions exercise counter exhaustion without billions of resets.
  friend struct StarfishAvSessionStateTestPeer;
  struct Entry {
    uint64_t sequence;
    Packet packet;
  };
  struct Queue {
    std::deque<Entry> packets;
    size_t bytes = 0;
    uint64_t next_sequence = 0;
    bool eos = false;
  };
  Queue& Get(Stream stream) { return stream == Stream::kAudio ? audio_ : video_; }
  const Queue& Get(Stream stream) const {
    return stream == Stream::kAudio ? audio_ : video_;
  }
  const Limits audio_limits_;
  const Limits video_limits_;
  Queue audio_, video_;
  uint64_t generation_ = 1;
  bool failed_ = false;
  bool eos_submitted_ = false;
  bool ended_ = false;
};

}  // namespace webos
}  // namespace shared
}  // namespace starboard
#endif  // STARBOARD_WEBOS_ARM_STARFISH_AV_SESSION_STATE_H_

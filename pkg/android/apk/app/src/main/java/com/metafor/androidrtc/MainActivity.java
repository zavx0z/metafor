package com.metafor.androidrtc;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionConfig;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONObject;
import org.webrtc.DataChannel;
import org.webrtc.DefaultVideoDecoderFactory;
import org.webrtc.DefaultVideoEncoderFactory;
import org.webrtc.EglBase;
import org.webrtc.IceCandidate;
import org.webrtc.MediaConstraints;
import org.webrtc.MediaStream;
import org.webrtc.MediaStreamTrack;
import org.webrtc.PeerConnection;
import org.webrtc.PeerConnectionFactory;
import org.webrtc.RtpReceiver;
import org.webrtc.ScreenCapturerAndroid;
import org.webrtc.SdpObserver;
import org.webrtc.SessionDescription;
import org.webrtc.SurfaceTextureHelper;
import org.webrtc.VideoCapturer;
import org.webrtc.VideoSource;
import org.webrtc.VideoTrack;

public final class MainActivity extends Activity {
  private static final int SCREEN_CAPTURE_REQUEST = 17;
  private static final int FOREGROUND_WAIT_STEP_MS = 50;
  private static final int FOREGROUND_WAIT_TIMEOUT_MS = 2000;
  private static final String DEFAULT_SIGNALING_URL =
    "wss://192.168.8.106/hud/webrtc/signaling?room=android-display&peer=android";

  private final Handler mainHandler = new Handler(Looper.getMainLooper());
  private EditText signalingInput;
  private TextView statusView;
  private SignalingClient signaling;
  private EglBase eglBase;
  private PeerConnectionFactory factory;
  private final Map<String, PeerConnection> peerConnections = new HashMap<>();
  private VideoCapturer screenCapturer;
  private SurfaceTextureHelper surfaceTextureHelper;
  private VideoSource videoSource;
  private VideoTrack localVideoTrack;

  @Override protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    setContentView(createLayout());
    initWebRtcFactory();
  }

  @Override protected void onDestroy() {
    closeRtc();
    super.onDestroy();
  }

  @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);
    if (requestCode != SCREEN_CAPTURE_REQUEST) return;
    if (resultCode != RESULT_OK || data == null) {
      setStatus("screen capture denied");
      return;
    }
    startScreenCapture(data);
  }

  private LinearLayout createLayout() {
    LinearLayout root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setGravity(Gravity.CENTER_HORIZONTAL);
    int pad = dp(18);
    root.setPadding(pad, pad, pad, pad);

    TextView title = new TextView(this);
    title.setText("MetaFor Android RTC");
    title.setTextSize(20);
    title.setGravity(Gravity.CENTER_HORIZONTAL);
    root.addView(title, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

    signalingInput = new EditText(this);
    signalingInput.setSingleLine(false);
    signalingInput.setMinLines(2);
    signalingInput.setText(DEFAULT_SIGNALING_URL);
    root.addView(signalingInput, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

    Button accessibility = new Button(this);
    accessibility.setText("Open Accessibility Settings");
    accessibility.setOnClickListener((view) -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
    root.addView(accessibility, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

    Button start = new Button(this);
    start.setText("Start Screen RTC");
    start.setOnClickListener((view) -> requestScreenCapture());
    root.addView(start, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

    statusView = new TextView(this);
    statusView.setTextSize(13);
    statusView.setText("idle");
    statusView.setPadding(0, dp(10), 0, 0);
    root.addView(statusView, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
    return root;
  }

  private void initWebRtcFactory() {
    PeerConnectionFactory.initialize(
      PeerConnectionFactory.InitializationOptions.builder(this)
        .setEnableInternalTracer(false)
        .createInitializationOptions()
    );
    eglBase = EglBase.create();
    factory = PeerConnectionFactory.builder()
      .setVideoEncoderFactory(new DefaultVideoEncoderFactory(eglBase.getEglBaseContext(), true, true))
      .setVideoDecoderFactory(new DefaultVideoDecoderFactory(eglBase.getEglBaseContext()))
      .createPeerConnectionFactory();
  }

  private void requestScreenCapture() {
    MediaProjectionManager manager = (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
    if (manager == null) {
      setStatus("MediaProjectionManager unavailable");
      return;
    }
    Intent intent = Build.VERSION.SDK_INT >= 34
      ? manager.createScreenCaptureIntent(MediaProjectionConfig.createConfigForDefaultDisplay())
      : manager.createScreenCaptureIntent();
    startActivityForResult(intent, SCREEN_CAPTURE_REQUEST);
  }

  private void startScreenCapture(Intent data) {
    closeAllPeers();
    stopScreenCapture();
    Intent serviceIntent = new Intent(this, ProjectionForegroundService.class);
    ProjectionForegroundService.resetForeground();
    if (Build.VERSION.SDK_INT >= 26) startForegroundService(serviceIntent);
    else startService(serviceIntent);
    setStatus("starting foreground service");
    waitForProjectionService(data, 0);
  }

  private void waitForProjectionService(Intent data, int elapsedMs) {
    if (ProjectionForegroundService.isForeground() || elapsedMs >= FOREGROUND_WAIT_TIMEOUT_MS) {
      try {
        startScreenCaptureNow(data);
        connectSignaling();
      } catch (Exception error) {
        setStatus("start failed: " + error.getMessage());
      }
      return;
    }
    mainHandler.postDelayed(
      () -> waitForProjectionService(data, elapsedMs + FOREGROUND_WAIT_STEP_MS),
      FOREGROUND_WAIT_STEP_MS
    );
  }

  private void startScreenCaptureNow(Intent data) {
    DisplayMetrics captureSize = captureDisplaySize();
    screenCapturer = new ScreenCapturerAndroid(data, new MediaProjection.Callback() {});
    videoSource = factory.createVideoSource(false);
    surfaceTextureHelper = SurfaceTextureHelper.create("MetaforScreenCapture", eglBase.getEglBaseContext());
    screenCapturer.initialize(surfaceTextureHelper, getApplicationContext(), videoSource.getCapturerObserver());
    screenCapturer.startCapture(captureSize.widthPixels, captureSize.heightPixels, 30);
    localVideoTrack = factory.createVideoTrack("metafor-screen", videoSource);
    localVideoTrack.setEnabled(true);
    setStatus("screen capture " + captureSize.widthPixels + "x" + captureSize.heightPixels
      + "; accessibility=" + AndroidControlAccessibilityService.isReady());
  }

  private DisplayMetrics captureDisplaySize() {
    DisplayMetrics metrics = new DisplayMetrics();
    getWindowManager().getDefaultDisplay().getRealMetrics(metrics);
    if (metrics.widthPixels <= 0 || metrics.heightPixels <= 0) {
      metrics.widthPixels = 720;
      metrics.heightPixels = 1280;
    }
    return metrics;
  }

  private void connectSignaling() {
    if (signaling != null) signaling.close();
    signaling = new SignalingClient(new SignalingClient.Listener() {
      @Override public void onOpen() {
        setStatus("signaling connected");
      }

      @Override public void onClosed(String reason) {
        setStatus("signaling closed " + reason);
      }

      @Override public void onError(String message) {
        setStatus("signaling error " + message);
      }

      @Override public void onHello(String room, String peerId, org.json.JSONArray peers) {
        setStatus("room " + room + " as " + peerId);
      }

      @Override public void onPeerJoined(String peerId) {
        setStatus("peer joined " + peerId);
      }

      @Override public void onPeerLeft(String peerId) {
        setStatus("peer left " + peerId);
        closePeer(peerId);
      }

      @Override public void onOffer(String from, JSONObject description) {
        runOnUiThread(() -> acceptOffer(from, description));
      }

      @Override public void onAnswer(String from, JSONObject description) {}

      @Override public void onIce(String from, JSONObject candidate) {
        runOnUiThread(() -> addIce(from, candidate));
      }
    });
    signaling.connect(signalingInput.getText().toString().trim());
  }

  private void acceptOffer(String from, JSONObject description) {
    try {
      PeerConnection pc = ensurePeerConnection(from);
      SessionDescription remote = new SessionDescription(
        SessionDescription.Type.fromCanonicalForm(description.getString("type")),
        description.getString("sdp")
      );
      pc.setRemoteDescription(new SimpleSdpObserver("setRemote") {
        @Override public void onSetSuccess() {
          createAnswer(from, pc);
        }
      }, remote);
    } catch (Exception error) {
      setStatus("offer failed " + error.getMessage());
    }
  }

  private void createAnswer(String to, PeerConnection pc) {
    pc.createAnswer(new SimpleSdpObserver("createAnswer") {
      @Override public void onCreateSuccess(SessionDescription sessionDescription) {
        pc.setLocalDescription(new SimpleSdpObserver("setLocal") {
          @Override public void onSetSuccess() {
            try {
              JSONObject answer = new JSONObject();
              answer.put("type", "answer");
              answer.put("to", to);
              answer.put("description", descriptionJson(sessionDescription));
              signaling.send(answer);
              setStatus("answer sent");
            } catch (Exception error) {
              setStatus("answer json " + error.getMessage());
            }
          }
        }, sessionDescription);
      }
    }, new MediaConstraints());
  }

  private PeerConnection ensurePeerConnection(String remotePeerId) {
    PeerConnection existing = peerConnections.get(remotePeerId);
    if (existing != null) return existing;
    PeerConnection.RTCConfiguration config = new PeerConnection.RTCConfiguration(Collections.emptyList());
    config.sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN;
    PeerConnection peerConnection = factory.createPeerConnection(config, new PeerConnection.Observer() {
      @Override public void onSignalingChange(PeerConnection.SignalingState state) {}
      @Override public void onIceConnectionChange(PeerConnection.IceConnectionState state) {
        setStatus("ice " + remotePeerId + " " + state);
      }
      @Override public void onIceConnectionReceivingChange(boolean receiving) {}
      @Override public void onIceGatheringChange(PeerConnection.IceGatheringState state) {}
      @Override public void onIceCandidate(IceCandidate candidate) {
        sendIce(remotePeerId, candidate);
      }
      @Override public void onIceCandidatesRemoved(IceCandidate[] candidates) {}
      @Override public void onAddStream(MediaStream stream) {}
      @Override public void onRemoveStream(MediaStream stream) {}
      @Override public void onDataChannel(DataChannel dataChannel) {
        attachDataChannel(dataChannel);
      }
      @Override public void onRenegotiationNeeded() {}
      @Override public void onAddTrack(RtpReceiver receiver, MediaStream[] streams) {}
    });
    if (peerConnection == null) throw new IllegalStateException("PeerConnection failed");
    peerConnections.put(remotePeerId, peerConnection);
    if (localVideoTrack != null) {
      peerConnection.addTrack(localVideoTrack, Collections.singletonList("metafor-screen"));
    }
    return peerConnection;
  }

  private void attachDataChannel(DataChannel channel) {
    channel.registerObserver(new DataChannel.Observer() {
      @Override public void onBufferedAmountChange(long previousAmount) {}
      @Override public void onStateChange() {
        setStatus("datachannel " + channel.state());
      }
      @Override public void onMessage(DataChannel.Buffer buffer) {
        ByteBuffer data = buffer.data;
        byte[] bytes = new byte[data.remaining()];
        data.get(bytes);
        String text = new String(bytes, StandardCharsets.UTF_8);
        try {
          JSONObject command = new JSONObject(text);
          runOnUiThread(() -> executeControlCommand(channel, command));
        } catch (Exception error) {
          setStatus("control error " + error.getMessage());
        }
      }
    });
  }

  private void executeControlCommand(DataChannel channel, JSONObject command) {
    boolean ok = AndroidControlAccessibilityService.execute(command);
    String commandType = command.optString("type", "?");
    setStatus("control " + commandType + " " + ok);
    try {
      JSONObject result = new JSONObject();
      result.put("type", "control-result");
      result.put("ok", ok);
      result.put("command", commandType);
      result.put("accessibility", AndroidControlAccessibilityService.isReady());
      String id = command.optString("id", "");
      if (!id.isEmpty()) result.put("id", id);
      channel.send(new DataChannel.Buffer(
        ByteBuffer.wrap(result.toString().getBytes(StandardCharsets.UTF_8)),
        false
      ));
    } catch (Exception error) {
      setStatus("control ack error " + error.getMessage());
    }
  }

  private void sendIce(String to, IceCandidate candidate) {
    if (signaling == null) return;
    try {
      JSONObject message = new JSONObject();
      message.put("type", "ice");
      message.put("to", to);
      JSONObject payload = new JSONObject();
      payload.put("sdpMid", candidate.sdpMid);
      payload.put("sdpMLineIndex", candidate.sdpMLineIndex);
      payload.put("candidate", candidate.sdp);
      message.put("candidate", payload);
      signaling.send(message);
    } catch (Exception error) {
      setStatus("ice json " + error.getMessage());
    }
  }

  private void addIce(String from, JSONObject object) {
    PeerConnection peerConnection = peerConnections.get(from);
    if (peerConnection == null) return;
    try {
      peerConnection.addIceCandidate(new IceCandidate(
        object.optString("sdpMid"),
        object.optInt("sdpMLineIndex"),
        object.getString("candidate")
      ));
    } catch (Exception error) {
      setStatus("ice failed " + error.getMessage());
    }
  }

  private JSONObject descriptionJson(SessionDescription description) throws Exception {
    JSONObject object = new JSONObject();
    object.put("type", description.type.canonicalForm());
    object.put("sdp", description.description);
    return object;
  }

  private void closeRtc() {
    if (signaling != null) {
      signaling.close();
      signaling = null;
    }
    closeAllPeers();
    stopScreenCapture();
    if (factory != null) {
      factory.dispose();
      factory = null;
    }
    if (eglBase != null) {
      eglBase.release();
      eglBase = null;
    }
  }

  private void closePeer(String remotePeerId) {
    PeerConnection peerConnection = peerConnections.remove(remotePeerId);
    if (peerConnection == null) return;
    peerConnection.close();
    peerConnection.dispose();
  }

  private void closeAllPeers() {
    for (String remotePeerId : peerConnections.keySet().toArray(new String[0])) {
      closePeer(remotePeerId);
    }
  }

  private void stopScreenCapture() {
    if (screenCapturer != null) {
      try {
        screenCapturer.stopCapture();
      } catch (InterruptedException ignored) {
        Thread.currentThread().interrupt();
      }
      screenCapturer.dispose();
      screenCapturer = null;
    }
    if (localVideoTrack != null) {
      localVideoTrack.dispose();
      localVideoTrack = null;
    }
    if (videoSource != null) {
      videoSource.dispose();
      videoSource = null;
    }
    if (surfaceTextureHelper != null) {
      surfaceTextureHelper.dispose();
      surfaceTextureHelper = null;
    }
    stopService(new Intent(this, ProjectionForegroundService.class));
  }

  private void setStatus(String text) {
    runOnUiThread(() -> statusView.setText(text));
  }

  private int dp(int value) {
    return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
  }

  private static class SimpleSdpObserver implements SdpObserver {
    private final String label;

    SimpleSdpObserver(String label) {
      this.label = label;
    }

    @Override public void onCreateSuccess(SessionDescription sessionDescription) {}
    @Override public void onSetSuccess() {}
    @Override public void onCreateFailure(String error) {}
    @Override public void onSetFailure(String error) {}
    @Override public String toString() {
      return label;
    }
  }
}

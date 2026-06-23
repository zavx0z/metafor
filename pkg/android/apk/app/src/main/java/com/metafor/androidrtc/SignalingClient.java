package com.metafor.androidrtc;

import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class SignalingClient {
  interface Listener {
    void onOpen();
    void onClosed(String reason);
    void onError(String message);
    void onHello(String room, String peerId, JSONArray peers);
    void onPeerJoined(String peerId);
    void onPeerLeft(String peerId);
    void onOffer(String from, JSONObject description);
    void onAnswer(String from, JSONObject description);
    void onIce(String from, JSONObject candidate);
  }

  private final OkHttpClient client = createClient();
  private final Listener listener;
  private WebSocket socket;

  SignalingClient(Listener listener) {
    this.listener = listener;
  }

  void connect(String url) {
    close();
    Request request = new Request.Builder().url(url).build();
    socket = client.newWebSocket(request, new WebSocketListener() {
      @Override public void onOpen(WebSocket webSocket, Response response) {
        listener.onOpen();
      }

      @Override public void onMessage(WebSocket webSocket, String text) {
        handleMessage(text);
      }

      @Override public void onClosed(WebSocket webSocket, int code, String reason) {
        listener.onClosed(reason);
      }

      @Override public void onFailure(WebSocket webSocket, Throwable t, Response response) {
        listener.onError(t.getMessage() == null ? t.toString() : t.getMessage());
      }
    });
  }

  void send(JSONObject object) {
    WebSocket current = socket;
    if (current != null) current.send(object.toString());
  }

  void close() {
    WebSocket current = socket;
    socket = null;
    if (current != null) current.close(1000, "closed");
  }

  private void handleMessage(String text) {
    try {
      JSONObject object = new JSONObject(text);
      String type = object.optString("type", "");
      String from = object.optString("from", "");
      if ("hello".equals(type)) {
        listener.onHello(object.optString("room", ""), object.optString("peerId", ""), object.optJSONArray("peers"));
      } else if ("ready".equals(type)) {
        return;
      } else if ("joined".equals(type)) {
        String conversationId = object.optString("conversationId", "");
        JSONObject self = object.optJSONObject("self");
        String participantId = self != null
          ? self.optString("participantId", "")
          : object.optString("participantId", "");
        JSONArray participants = object.optJSONArray("participants");
        JSONArray peers = new JSONArray();
        if (participants != null) {
          for (int index = 0; index < participants.length(); index += 1) {
            JSONObject participant = participants.optJSONObject(index);
            if (participant == null) continue;
            String peerId = participant.optString("participantId", "");
            if (!peerId.isEmpty() && !peerId.equals(participantId)) peers.put(peerId);
          }
        }
        listener.onHello(conversationId, participantId, peers);
      } else if ("participant:joined".equals(type)) {
        JSONObject participant = object.optJSONObject("participant");
        if (participant != null) listener.onPeerJoined(participant.optString("participantId", ""));
      } else if ("participant:left".equals(type)) {
        JSONObject participant = object.optJSONObject("participant");
        if (participant != null) listener.onPeerLeft(participant.optString("participantId", ""));
      } else if ("signal".equals(type)) {
        String kind = object.optString("kind", "");
        String sender = object.optString("fromParticipantId", from);
        JSONObject payload = object.optJSONObject("payload");
        if ("offer".equals(kind) && payload != null) {
          listener.onOffer(sender, payload);
        } else if ("answer".equals(kind) && payload != null) {
          listener.onAnswer(sender, payload);
        } else if (("ice".equals(kind) || "candidate".equals(kind)) && payload != null) {
          listener.onIce(sender, payload);
        } else if ("bye".equals(kind)) {
          listener.onPeerLeft(sender);
        }
      } else if ("error".equals(type)) {
        listener.onError(object.optString("error", "server error"));
      } else if ("peer-joined".equals(type)) {
        listener.onPeerJoined(object.optString("peerId", ""));
      } else if ("peer-left".equals(type)) {
        listener.onPeerLeft(object.optString("peerId", ""));
      } else if ("offer".equals(type)) {
        listener.onOffer(from, object.getJSONObject("description"));
      } else if ("answer".equals(type)) {
        listener.onAnswer(from, object.getJSONObject("description"));
      } else if ("ice".equals(type)) {
        listener.onIce(from, object.getJSONObject("candidate"));
      }
    } catch (JSONException error) {
      listener.onError(error.getMessage());
    }
  }

  private static OkHttpClient createClient() {
    try {
      X509TrustManager trustManager = new X509TrustManager() {
        @Override public void checkClientTrusted(X509Certificate[] chain, String authType) {}
        @Override public void checkServerTrusted(X509Certificate[] chain, String authType) {}
        @Override public X509Certificate[] getAcceptedIssuers() {
          return new X509Certificate[0];
        }
      };
      SSLContext context = SSLContext.getInstance("TLS");
      context.init(null, new TrustManager[] {trustManager}, new SecureRandom());
      HostnameVerifier hostnameVerifier = (hostname, session) -> hostname.startsWith("192.168.")
        || hostname.startsWith("10.")
        || hostname.equals("127.0.0.1")
        || hostname.equals("localhost");
      return new OkHttpClient.Builder()
        .sslSocketFactory(context.getSocketFactory(), trustManager)
        .hostnameVerifier(hostnameVerifier)
        .build();
    } catch (Exception error) {
      return new OkHttpClient();
    }
  }
}

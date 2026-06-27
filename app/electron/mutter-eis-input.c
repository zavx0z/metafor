#define _GNU_SOURCE

#include <dlfcn.h>
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

struct ei;
struct ei_event;
struct ei_seat;
struct ei_device;
struct ei_region;

enum {
  EI_EVENT_CONNECT = 1,
  EI_EVENT_DISCONNECT = 2,
  EI_EVENT_SEAT_ADDED = 3,
  EI_EVENT_DEVICE_ADDED = 5,
  EI_EVENT_DEVICE_REMOVED = 6,
  EI_EVENT_DEVICE_PAUSED = 7,
  EI_EVENT_DEVICE_RESUMED = 8,
};

enum {
  EI_DEVICE_CAP_POINTER = 1 << 0,
  EI_DEVICE_CAP_POINTER_ABSOLUTE = 1 << 1,
  EI_DEVICE_CAP_KEYBOARD = 1 << 2,
  EI_DEVICE_CAP_SCROLL = 1 << 4,
  EI_DEVICE_CAP_BUTTON = 1 << 5,
};

typedef struct ei *(*fn_ei_new_sender)(void *);
typedef void (*fn_ei_configure_name)(struct ei *, const char *);
typedef int (*fn_ei_setup_backend_fd)(struct ei *, int);
typedef int (*fn_ei_get_fd)(struct ei *);
typedef void (*fn_ei_dispatch)(struct ei *);
typedef struct ei_event *(*fn_ei_get_event)(struct ei *);
typedef int (*fn_ei_event_get_type)(struct ei_event *);
typedef struct ei_seat *(*fn_ei_event_get_seat)(struct ei_event *);
typedef struct ei_device *(*fn_ei_event_get_device)(struct ei_event *);
typedef struct ei_event *(*fn_ei_event_unref)(struct ei_event *);
typedef void (*fn_ei_seat_bind_capabilities)(struct ei_seat *, ...);
typedef bool (*fn_ei_device_has_capability)(struct ei_device *, int);
typedef struct ei_device *(*fn_ei_device_ref)(struct ei_device *);
typedef struct ei_device *(*fn_ei_device_unref)(struct ei_device *);
typedef const char *(*fn_ei_device_get_name)(struct ei_device *);
typedef struct ei_region *(*fn_ei_device_get_region)(struct ei_device *, size_t);
typedef uint32_t (*fn_ei_region_get_u32)(struct ei_region *);
typedef void (*fn_ei_device_start_emulating)(struct ei_device *, uint32_t);
typedef void (*fn_ei_device_stop_emulating)(struct ei_device *);
typedef void (*fn_ei_device_pointer_motion_absolute)(struct ei_device *, double, double);
typedef void (*fn_ei_device_pointer_motion)(struct ei_device *, double, double);
typedef void (*fn_ei_device_button_button)(struct ei_device *, uint32_t, bool);
typedef void (*fn_ei_device_scroll_delta)(struct ei_device *, double, double);
typedef void (*fn_ei_device_keyboard_key)(struct ei_device *, uint32_t, bool);
typedef void (*fn_ei_device_frame)(struct ei_device *, uint64_t);
typedef uint64_t (*fn_ei_now)(struct ei *);
typedef struct ei *(*fn_ei_unref)(struct ei *);

static fn_ei_new_sender p_ei_new_sender;
static fn_ei_configure_name p_ei_configure_name;
static fn_ei_setup_backend_fd p_ei_setup_backend_fd;
static fn_ei_get_fd p_ei_get_fd;
static fn_ei_dispatch p_ei_dispatch;
static fn_ei_get_event p_ei_get_event;
static fn_ei_event_get_type p_ei_event_get_type;
static fn_ei_event_get_seat p_ei_event_get_seat;
static fn_ei_event_get_device p_ei_event_get_device;
static fn_ei_event_unref p_ei_event_unref;
static fn_ei_seat_bind_capabilities p_ei_seat_bind_capabilities;
static fn_ei_device_has_capability p_ei_device_has_capability;
static fn_ei_device_ref p_ei_device_ref;
static fn_ei_device_unref p_ei_device_unref;
static fn_ei_device_get_name p_ei_device_get_name;
static fn_ei_device_get_region p_ei_device_get_region;
static fn_ei_region_get_u32 p_ei_region_get_x;
static fn_ei_region_get_u32 p_ei_region_get_y;
static fn_ei_region_get_u32 p_ei_region_get_width;
static fn_ei_region_get_u32 p_ei_region_get_height;
static fn_ei_device_start_emulating p_ei_device_start_emulating;
static fn_ei_device_stop_emulating p_ei_device_stop_emulating;
static fn_ei_device_pointer_motion_absolute p_ei_device_pointer_motion_absolute;
static fn_ei_device_pointer_motion p_ei_device_pointer_motion;
static fn_ei_device_button_button p_ei_device_button_button;
static fn_ei_device_scroll_delta p_ei_device_scroll_delta;
static fn_ei_device_keyboard_key p_ei_device_keyboard_key;
static fn_ei_device_frame p_ei_device_frame;
static fn_ei_now p_ei_now;
static fn_ei_unref p_ei_unref;

static struct ei *ctx = NULL;
static struct ei_device *abs_dev = NULL;
static struct ei_device *pointer_dev = NULL;
static struct ei_device *button_dev = NULL;
static struct ei_device *scroll_dev = NULL;
static struct ei_device *keyboard_dev = NULL;
static uint32_t sequence = 1;
static bool ready_reported = false;
static double region_x = 0;
static double region_y = 0;
static double region_w = 0;
static double region_h = 0;

static void json_error(int id, const char *error) {
  printf("{\"type\":\"eisResult\",\"id\":%d,\"ok\":false,\"error\":\"%s\"}\n", id, error);
  fflush(stdout);
}

static void json_ok(int id, const char *kind) {
  printf("{\"type\":\"eisResult\",\"id\":%d,\"ok\":true,\"input\":{\"type\":\"%s\"}}\n", id, kind);
  fflush(stdout);
}

static void *sym(void *handle, const char *name) {
  void *ptr = dlsym(handle, name);
  if (ptr == NULL) {
    fprintf(stderr, "missing libei symbol: %s\n", name);
    exit(2);
  }
  return ptr;
}

static void load_libei(void) {
  void *handle = dlopen("libei.so.1", RTLD_NOW | RTLD_LOCAL);
  if (handle == NULL) {
    fprintf(stderr, "dlopen libei.so.1 failed: %s\n", dlerror());
    exit(2);
  }
  p_ei_new_sender = (fn_ei_new_sender)sym(handle, "ei_new_sender");
  p_ei_configure_name = (fn_ei_configure_name)sym(handle, "ei_configure_name");
  p_ei_setup_backend_fd = (fn_ei_setup_backend_fd)sym(handle, "ei_setup_backend_fd");
  p_ei_get_fd = (fn_ei_get_fd)sym(handle, "ei_get_fd");
  p_ei_dispatch = (fn_ei_dispatch)sym(handle, "ei_dispatch");
  p_ei_get_event = (fn_ei_get_event)sym(handle, "ei_get_event");
  p_ei_event_get_type = (fn_ei_event_get_type)sym(handle, "ei_event_get_type");
  p_ei_event_get_seat = (fn_ei_event_get_seat)sym(handle, "ei_event_get_seat");
  p_ei_event_get_device = (fn_ei_event_get_device)sym(handle, "ei_event_get_device");
  p_ei_event_unref = (fn_ei_event_unref)sym(handle, "ei_event_unref");
  p_ei_seat_bind_capabilities = (fn_ei_seat_bind_capabilities)sym(handle, "ei_seat_bind_capabilities");
  p_ei_device_has_capability = (fn_ei_device_has_capability)sym(handle, "ei_device_has_capability");
  p_ei_device_ref = (fn_ei_device_ref)sym(handle, "ei_device_ref");
  p_ei_device_unref = (fn_ei_device_unref)sym(handle, "ei_device_unref");
  p_ei_device_get_name = (fn_ei_device_get_name)sym(handle, "ei_device_get_name");
  p_ei_device_get_region = (fn_ei_device_get_region)sym(handle, "ei_device_get_region");
  p_ei_region_get_x = (fn_ei_region_get_u32)sym(handle, "ei_region_get_x");
  p_ei_region_get_y = (fn_ei_region_get_u32)sym(handle, "ei_region_get_y");
  p_ei_region_get_width = (fn_ei_region_get_u32)sym(handle, "ei_region_get_width");
  p_ei_region_get_height = (fn_ei_region_get_u32)sym(handle, "ei_region_get_height");
  p_ei_device_start_emulating = (fn_ei_device_start_emulating)sym(handle, "ei_device_start_emulating");
  p_ei_device_stop_emulating = (fn_ei_device_stop_emulating)sym(handle, "ei_device_stop_emulating");
  p_ei_device_pointer_motion_absolute = (fn_ei_device_pointer_motion_absolute)sym(handle, "ei_device_pointer_motion_absolute");
  p_ei_device_pointer_motion = (fn_ei_device_pointer_motion)sym(handle, "ei_device_pointer_motion");
  p_ei_device_button_button = (fn_ei_device_button_button)sym(handle, "ei_device_button_button");
  p_ei_device_scroll_delta = (fn_ei_device_scroll_delta)sym(handle, "ei_device_scroll_delta");
  p_ei_device_keyboard_key = (fn_ei_device_keyboard_key)sym(handle, "ei_device_keyboard_key");
  p_ei_device_frame = (fn_ei_device_frame)sym(handle, "ei_device_frame");
  p_ei_now = (fn_ei_now)sym(handle, "ei_now");
  p_ei_unref = (fn_ei_unref)sym(handle, "ei_unref");
}

static void ref_device(struct ei_device **slot, struct ei_device *device) {
  if (*slot != NULL || device == NULL) return;
  *slot = p_ei_device_ref(device);
}

static bool device_matches(struct ei_device *a, struct ei_device *b) {
  return a != NULL && b != NULL && a == b;
}

static void clear_device(struct ei_device *device) {
  if (device_matches(abs_dev, device)) {
    p_ei_device_unref(abs_dev);
    abs_dev = NULL;
  }
  if (device_matches(pointer_dev, device)) {
    p_ei_device_unref(pointer_dev);
    pointer_dev = NULL;
  }
  if (device_matches(button_dev, device)) {
    p_ei_device_unref(button_dev);
    button_dev = NULL;
  }
  if (device_matches(scroll_dev, device)) {
    p_ei_device_unref(scroll_dev);
    scroll_dev = NULL;
  }
  if (device_matches(keyboard_dev, device)) {
    p_ei_device_unref(keyboard_dev);
    keyboard_dev = NULL;
  }
}

static void update_region(struct ei_device *device) {
  struct ei_region *region = p_ei_device_get_region(device, 0);
  if (region == NULL) return;
  region_x = p_ei_region_get_x(region);
  region_y = p_ei_region_get_y(region);
  region_w = p_ei_region_get_width(region);
  region_h = p_ei_region_get_height(region);
}

static void maybe_report_ready(void) {
  if (ready_reported || abs_dev == NULL) return;
  ready_reported = true;
  printf("{\"type\":\"eisReady\",\"ready\":true,\"region\":{\"x\":%.0f,\"y\":%.0f,\"w\":%.0f,\"h\":%.0f}}\n",
    region_x, region_y, region_w, region_h);
  fflush(stdout);
}

static void process_event(struct ei_event *event) {
  int type = p_ei_event_get_type(event);
  if (type == EI_EVENT_SEAT_ADDED) {
    struct ei_seat *seat = p_ei_event_get_seat(event);
    p_ei_seat_bind_capabilities(
      seat,
      EI_DEVICE_CAP_POINTER_ABSOLUTE,
      EI_DEVICE_CAP_POINTER,
      EI_DEVICE_CAP_BUTTON,
      EI_DEVICE_CAP_SCROLL,
      EI_DEVICE_CAP_KEYBOARD,
      0
    );
  } else if (type == EI_EVENT_DEVICE_ADDED) {
    struct ei_device *device = p_ei_event_get_device(event);
    if (p_ei_device_has_capability(device, EI_DEVICE_CAP_POINTER_ABSOLUTE)) {
      ref_device(&abs_dev, device);
      update_region(device);
    }
    if (p_ei_device_has_capability(device, EI_DEVICE_CAP_POINTER)) ref_device(&pointer_dev, device);
    if (p_ei_device_has_capability(device, EI_DEVICE_CAP_BUTTON)) ref_device(&button_dev, device);
    if (p_ei_device_has_capability(device, EI_DEVICE_CAP_SCROLL)) ref_device(&scroll_dev, device);
    if (p_ei_device_has_capability(device, EI_DEVICE_CAP_KEYBOARD)) ref_device(&keyboard_dev, device);
  } else if (type == EI_EVENT_DEVICE_RESUMED) {
    struct ei_device *device = p_ei_event_get_device(event);
    p_ei_device_start_emulating(device, sequence++);
    maybe_report_ready();
  } else if (type == EI_EVENT_DEVICE_PAUSED) {
    struct ei_device *device = p_ei_event_get_device(event);
    p_ei_device_stop_emulating(device);
  } else if (type == EI_EVENT_DEVICE_REMOVED) {
    clear_device(p_ei_event_get_device(event));
  } else if (type == EI_EVENT_DISCONNECT) {
    fprintf(stderr, "EIS disconnected\n");
    exit(1);
  }
}

static void dispatch_ei(void) {
  p_ei_dispatch(ctx);
  for (;;) {
    struct ei_event *event = p_ei_get_event(ctx);
    if (event == NULL) break;
    process_event(event);
    p_ei_event_unref(event);
  }
}

static double map_x(double x, double frame_w) {
  if (region_w <= 0 || frame_w <= 0) return x;
  return region_x + x * region_w / frame_w;
}

static double map_y(double y, double frame_h) {
  if (region_h <= 0 || frame_h <= 0) return y;
  return region_y + y * region_h / frame_h;
}

static void frame_device(struct ei_device *device) {
  if (device != NULL) p_ei_device_frame(device, p_ei_now(ctx));
}

static void handle_command(char *line) {
  int id = 0;
  char cmd[32] = {0};
  if (sscanf(line, "%d %31s", &id, cmd) != 2) return;

  if (strcmp(cmd, "move") == 0) {
    double x = 0, y = 0, frame_w = 0, frame_h = 0;
    if (sscanf(line, "%d %31s %lf %lf %lf %lf", &id, cmd, &x, &y, &frame_w, &frame_h) != 6) {
      json_error(id, "invalid move command");
      return;
    }
    if (abs_dev == NULL) {
      json_error(id, "EIS absolute pointer device is not ready");
      return;
    }
    p_ei_device_pointer_motion_absolute(abs_dev, map_x(x, frame_w), map_y(y, frame_h));
    frame_device(abs_dev);
    json_ok(id, "mouseMove");
    return;
  }

  if (strcmp(cmd, "button") == 0) {
    unsigned int button = 0, press = 0;
    if (sscanf(line, "%d %31s %u %u", &id, cmd, &button, &press) != 4) {
      json_error(id, "invalid button command");
      return;
    }
    struct ei_device *device = button_dev != NULL ? button_dev : abs_dev;
    if (device == NULL) {
      json_error(id, "EIS button device is not ready");
      return;
    }
    p_ei_device_button_button(device, button, press != 0);
    frame_device(device);
    json_ok(id, press != 0 ? "mouseDown" : "mouseUp");
    return;
  }

  if (strcmp(cmd, "scroll") == 0) {
    double dx = 0, dy = 0;
    if (sscanf(line, "%d %31s %lf %lf", &id, cmd, &dx, &dy) != 4) {
      json_error(id, "invalid scroll command");
      return;
    }
    struct ei_device *device = scroll_dev != NULL ? scroll_dev : abs_dev;
    if (device == NULL) {
      json_error(id, "EIS scroll device is not ready");
      return;
    }
    p_ei_device_scroll_delta(device, dx, dy);
    frame_device(device);
    json_ok(id, "mouseWheel");
    return;
  }

  if (strcmp(cmd, "key") == 0) {
    unsigned int key = 0, press = 0;
    if (sscanf(line, "%d %31s %u %u", &id, cmd, &key, &press) != 4) {
      json_error(id, "invalid key command");
      return;
    }
    if (keyboard_dev == NULL) {
      json_error(id, "EIS keyboard device is not ready");
      return;
    }
    p_ei_device_keyboard_key(keyboard_dev, key, press != 0);
    frame_device(keyboard_dev);
    json_ok(id, press != 0 ? "keyDown" : "keyUp");
    return;
  }

  json_error(id, "unsupported command");
}

int main(int argc, char **argv) {
  if (argc != 2) {
    fprintf(stderr, "usage: %s <eis-fd>\n", argv[0]);
    return 2;
  }
  int fd = atoi(argv[1]);
  load_libei();
  ctx = p_ei_new_sender(NULL);
  if (ctx == NULL) {
    fprintf(stderr, "ei_new_sender failed\n");
    return 2;
  }
  p_ei_configure_name(ctx, "MetaFor remote desktop");
  int rc = p_ei_setup_backend_fd(ctx, fd);
  if (rc < 0) {
    fprintf(stderr, "ei_setup_backend_fd failed: %d\n", rc);
    return 2;
  }

  int ei_fd = p_ei_get_fd(ctx);
  char line[512];
  for (;;) {
    struct pollfd fds[2] = {
      {.fd = ei_fd, .events = POLLIN},
      {.fd = STDIN_FILENO, .events = POLLIN},
    };
    int prc = poll(fds, 2, -1);
    if (prc < 0) {
      if (errno == EINTR) continue;
      perror("poll");
      return 1;
    }
    if ((fds[0].revents & POLLIN) != 0) dispatch_ei();
    if ((fds[1].revents & POLLIN) != 0) {
      if (fgets(line, sizeof(line), stdin) == NULL) break;
      handle_command(line);
      dispatch_ei();
    }
    if ((fds[0].revents & (POLLERR | POLLHUP)) != 0) break;
    if ((fds[1].revents & (POLLERR | POLLHUP)) != 0) break;
  }

  if (ctx != NULL) p_ei_unref(ctx);
  return 0;
}

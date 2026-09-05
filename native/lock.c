#include <node_api.h>
#include <sys/file.h>
#include <unistd.h>
#include <errno.h>

// The JS owner opens the stable directory and closes it in finally. flock is
// released by the OS on process exit, including SIGKILL. No lockfile is created.
static napi_value try_lock(napi_env env, napi_callback_info info) {
  size_t count = 1;
  napi_value args[1], result;
  int32_t fd;
  if (napi_get_cb_info(env, info, &count, args, NULL, NULL) != napi_ok ||
      count != 1 || napi_get_value_int32(env, args[0], &fd) != napi_ok) {
    napi_throw_type_error(env, NULL, "Invalid lock descriptor"); return NULL;
  }
  int rc;
  do { rc = flock(fd, LOCK_EX | LOCK_NB); } while (rc < 0 && errno == EINTR);
  if (rc < 0 && errno != EWOULDBLOCK && errno != EAGAIN) {
    napi_throw_error(env, NULL, "Cannot lock directory"); return NULL;
  }
  napi_get_boolean(env, rc == 0, &result);
  return result;
}
static napi_value init(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
    {"tryLock", NULL, try_lock, NULL, NULL, NULL, napi_default, NULL}
  };
  napi_define_properties(env, exports, 1, properties);
  return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, init)

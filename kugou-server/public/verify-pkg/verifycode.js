"use strict";

function _classCallCheck(instance, Constructor) {
  if (!_instanceof(instance, Constructor)) {
    throw new TypeError("Cannot call a class as a function");
  }
}

function _defineProperties(target, props) {
  for (var i = 0; i < props.length; i++) {
    var descriptor = props[i];
    descriptor.enumerable = descriptor.enumerable || false;
    descriptor.configurable = true;
    if ("value" in descriptor) descriptor.writable = true;
    Object.defineProperty(target, descriptor.key, descriptor);
  }
}

function _createClass(Constructor, protoProps, staticProps) {
  if (protoProps) _defineProperties(Constructor.prototype, protoProps);
  if (staticProps) _defineProperties(Constructor, staticProps);
  return Constructor;
}

function _instanceof(left, right) {
  if (right != null && typeof Symbol !== "undefined" && right[Symbol.hasInstance]) {
    return !!right[Symbol.hasInstance](left);
  } else {
    return left instanceof right;
  }
}

function _typeof(obj) {
  "@babel/helpers - typeof";
  if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") {
    _typeof = function _typeof(obj) {
      return typeof obj;
    };
  } else {
    _typeof = function _typeof(obj) {
      return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype
        ? "symbol"
        : typeof obj;
    };
  }
  return _typeof(obj);
}

var wasm_bindgen;

(function () {
  var __exports = {};
  var wasm;
  var heap = new Array(32).fill(undefined);
  heap.push(undefined, null, true, false);

  function getObject(idx) {
    return heap[idx];
  }

  var heap_next = heap.length;

  function dropObject(idx) {
    if (idx < 36) return;
    heap[idx] = heap_next;
    heap_next = idx;
  }

  function takeObject(idx) {
    var ret = getObject(idx);
    dropObject(idx);
    return ret;
  }

  var cachedTextDecoder = new TextDecoder("utf-8", {
    ignoreBOM: true,
    fatal: true,
  });
  cachedTextDecoder.decode();
  var cachegetUint8Memory0 = null;

  function getUint8Memory0() {
    if (cachegetUint8Memory0 === null || cachegetUint8Memory0.buffer !== wasm.memory.buffer) {
      cachegetUint8Memory0 = new Uint8Array(wasm.memory.buffer);
    }

    return cachegetUint8Memory0;
  }

  function getStringFromWasm0(ptr, len) {
    return cachedTextDecoder.decode(getUint8Memory0().subarray(ptr, ptr + len));
  }

  function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    var idx = heap_next;
    heap_next = heap[idx];
    heap[idx] = obj;
    return idx;
  }

  var WASM_VECTOR_LEN = 0;
  var cachedTextEncoder = new TextEncoder("utf-8");
  var encodeString =
    typeof cachedTextEncoder.encodeInto === "function"
      ? function (arg, view) {
          return cachedTextEncoder.encodeInto(arg, view);
        }
      : function (arg, view) {
          var buf = cachedTextEncoder.encode(arg);
          view.set(buf);
          return {
            read: arg.length,
            written: buf.length,
          };
        };

  function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
      var buf = cachedTextEncoder.encode(arg);

      var _ptr = malloc(buf.length);

      getUint8Memory0()
        .subarray(_ptr, _ptr + buf.length)
        .set(buf);
      WASM_VECTOR_LEN = buf.length;
      return _ptr;
    }

    var len = arg.length;
    var ptr = malloc(len);
    var mem = getUint8Memory0();
    var offset = 0;

    for (; offset < len; offset++) {
      var code = arg.charCodeAt(offset);
      if (code > 0x7f) break;
      mem[ptr + offset] = code;
    }

    if (offset !== len) {
      if (offset !== 0) {
        arg = arg.slice(offset);
      }

      ptr = realloc(ptr, len, (len = offset + arg.length * 3));
      var view = getUint8Memory0().subarray(ptr + offset, ptr + len);
      var ret = encodeString(arg, view);
      offset += ret.written;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
  }

  function isLikeNone(x) {
    return x === undefined || x === null;
  }

  var cachegetInt32Memory0 = null;

  function getInt32Memory0() {
    if (cachegetInt32Memory0 === null || cachegetInt32Memory0.buffer !== wasm.memory.buffer) {
      cachegetInt32Memory0 = new Int32Array(wasm.memory.buffer);
    }

    return cachegetInt32Memory0;
  }

  function debugString(val) {
    // primitive types
    var type = _typeof(val);

    if (type == "number" || type == "boolean" || val == null) {
      return "".concat(val);
    }

    if (type == "string") {
      return '"'.concat(val, '"');
    }

    if (type == "symbol") {
      var description = val.description;

      if (description == null) {
        return "Symbol";
      } else {
        return "Symbol(".concat(description, ")");
      }
    }

    if (type == "function") {
      var name = val.name;

      if (typeof name == "string" && name.length > 0) {
        return "Function(".concat(name, ")");
      } else {
        return "Function";
      }
    } // objects

    if (Array.isArray(val)) {
      var length = val.length;
      var debug = "[";

      if (length > 0) {
        debug += debugString(val[0]);
      }

      for (var i = 1; i < length; i++) {
        debug += ", " + debugString(val[i]);
      }

      debug += "]";
      return debug;
    } // Test for built-in

    var builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    var className;

    if (builtInMatches.length > 1) {
      className = builtInMatches[1];
    } else {
      // Failed to match the standard '[object ClassName]'
      return toString.call(val);
    }

    if (className == "Object") {
      // we're a user defined class or Object
      // JSON.stringify avoids problems with cycles, and is generally much
      // easier than looping through ownProperties of `val`.
      try {
        return "Object(" + JSON.stringify(val) + ")";
      } catch (_) {
        return "Object";
      }
    } // errors

    if (_instanceof(val, Error)) {
      return "".concat(val.name, ": ").concat(val.message, "\n").concat(val.stack);
    } // TODO we could test for more things here, like `Set`s and `Map`s.

    return className;
  }

  function makeMutClosure(arg0, arg1, dtor, f) {
    var state = {
      a: arg0,
      b: arg1,
      cnt: 1,
    };

    var real = function real() {
      // First up with a closure we increment the internal reference
      // count. This ensures that the Rust closure environment won't
      // be deallocated while we're invoking it.
      state.cnt++;
      var a = state.a;
      state.a = 0;

      try {
        for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
          args[_key] = arguments[_key];
        }

        return f.apply(void 0, [a, state.b].concat(args));
      } finally {
        if (--state.cnt === 0) wasm.__wbindgen_export_2.get(dtor)(a, state.b);
        else state.a = a;
      }
    };

    real.original = state;
    return real;
  }

  function __wbg_adapter_26(arg0, arg1) {
    wasm._dyn_core__ops__function__FnMut_____Output___R_as_wasm_bindgen__closure__WasmClosure___describe__invoke__he25972c9b3fefae8(
      arg0,
      arg1,
    );
  }

  function __wbg_adapter_29(arg0, arg1, arg2) {
    wasm._dyn_core__ops__function__FnMut__A____Output___R_as_wasm_bindgen__closure__WasmClosure___describe__invoke__h7b132ceac93324a9(
      arg0,
      arg1,
      addHeapObject(arg2),
    );
  }

  function __wbg_adapter_32(arg0, arg1, arg2) {
    wasm._dyn_core__ops__function__FnMut__A____Output___R_as_wasm_bindgen__closure__WasmClosure___describe__invoke__h6d18d2f5d81b3bb0(
      arg0,
      arg1,
      addHeapObject(arg2),
    );
  }
  /**
   */

  __exports.run = function () {
    wasm.run();
  };

  function handleError(f) {
    return function () {
      try {
        return f.apply(this, arguments);
      } catch (e) {
        wasm.__wbindgen_exn_store(addHeapObject(e));
      }
    };
  }

  function getArrayU8FromWasm0(ptr, len) {
    return getUint8Memory0().subarray(ptr / 1, ptr / 1 + len);
  }

  var cachegetFloat64Memory0 = null;

  function getFloat64Memory0() {
    if (cachegetFloat64Memory0 === null || cachegetFloat64Memory0.buffer !== wasm.memory.buffer) {
      cachegetFloat64Memory0 = new Float64Array(wasm.memory.buffer);
    }

    return cachegetFloat64Memory0;
  }

  function __wbg_adapter_165(arg0, arg1, arg2, arg3) {
    wasm.wasm_bindgen__convert__closures__invoke2_mut__h695c06ab86e08564(
      arg0,
      arg1,
      addHeapObject(arg2),
      addHeapObject(arg3),
    );
  }
  /**
   */

  var EData = /*#__PURE__*/ (function () {
    _createClass(
      EData,
      [
        {
          key: "free",
          value: function free() {
            var ptr = this.ptr;
            this.ptr = 0;

            wasm.__wbg_edata_free(ptr);
          },
          /**
           */
        },
      ],
      [
        {
          key: "__wrap",
          value: function __wrap(ptr) {
            var obj = Object.create(EData.prototype);
            obj.ptr = ptr;
            return obj;
          },
        },
      ],
    );

    function EData() {
      _classCallCheck(this, EData);

      var ret = wasm.edata_new();
      return EData.__wrap(ret);
    }
    /**
     * @returns {string}
     */

    _createClass(EData, [
      {
        key: "get_edt",
        value: function get_edt() {
          try {
            wasm.edata_get_edt(8, this.ptr);
            var r0 = getInt32Memory0()[8 / 4 + 0];
            var r1 = getInt32Memory0()[8 / 4 + 1];
            return getStringFromWasm0(r0, r1);
          } finally {
            wasm.__wbindgen_free(r0, r1);
          }
        },
        /**
         * @returns {string}
         */
      },
      {
        key: "get_sid",
        value: function get_sid() {
          try {
            wasm.edata_get_sid(8, this.ptr);
            var r0 = getInt32Memory0()[8 / 4 + 0];
            var r1 = getInt32Memory0()[8 / 4 + 1];
            return getStringFromWasm0(r0, r1);
          } finally {
            wasm.__wbindgen_free(r0, r1);
          }
        },
      },
    ]);

    return EData;
  })();

  __exports.EData = EData;

  async function load(module, imports) {
    if (typeof Response === "function" && _instanceof(module, Response)) {
      if (typeof WebAssembly.instantiateStreaming === "function") {
        try {
          return await WebAssembly.instantiateStreaming(module, imports);
        } catch (e) {
          if (module.headers.get("Content-Type") != "application/wasm") {
            console.warn(
              "`WebAssembly.instantiateStreaming` failed because your server does not serve wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n",
              e,
            );
          } else {
            throw e;
          }
        }
      }

      var bytes = await module.arrayBuffer();
      return await WebAssembly.instantiate(bytes, imports);
    } else {
      var instance = await WebAssembly.instantiate(module, imports);

      if (_instanceof(instance, WebAssembly.Instance)) {
        return {
          instance: instance,
          module: module,
        };
      } else {
        return instance;
      }
    }
  }

  async function init(input) {
    if (typeof input === "undefined") {
      var src;

      if (typeof document === "undefined") {
        src = location.href;
      } else {
        src = document.currentScript.src;
      }

      input = src.replace(/\.js$/, "_bg.wasm");
    }

    var imports = {};
    imports.wbg = {};

    imports.wbg.__wbg_setTimeout_b3d3e28b860025e3 = function (arg0, arg1) {
      setTimeout(takeObject(arg0), arg1 >>> 0);
    };

    imports.wbg.__wbindgen_object_drop_ref = function (arg0) {
      takeObject(arg0);
    };

    imports.wbg.__wbindgen_cb_drop = function (arg0) {
      var obj = takeObject(arg0).original;

      if (obj.cnt-- == 1) {
        obj.a = 0;
        return true;
      }

      var ret = false;
      return ret;
    };

    imports.wbg.__wbindgen_string_new = function (arg0, arg1) {
      var ret = getStringFromWasm0(arg0, arg1);
      return addHeapObject(ret);
    };

    imports.wbg.__wbindgen_jsval_eq = function (arg0, arg1) {
      var ret = getObject(arg0) === getObject(arg1);
      return ret;
    };

    imports.wbg.__wbindgen_object_clone_ref = function (arg0) {
      var ret = getObject(arg0);
      return addHeapObject(ret);
    };

    imports.wbg.__wbindgen_cb_forget = function (arg0) {
      takeObject(arg0);
    };

    imports.wbg.__wbg_instanceof_Window_d64060d13377409b = function (arg0) {
      var ret = _instanceof(getObject(arg0), Window);

      return ret;
    };

    imports.wbg.__wbg_document_bcf9d67bc56e8c6d = function (arg0) {
      var ret = getObject(arg0).document;
      return isLikeNone(ret) ? 0 : addHeapObject(ret);
    };

    imports.wbg.__wbg_navigator_a1711d7939511fb0 = function (arg0) {
      var ret = getObject(arg0).navigator;
      return addHeapObject(ret);
    };

    imports.wbg.__wbg_crypto_e775ee2e074e46de = handleError(function (arg0) {
      var ret = getObject(arg0).crypto;
      return addHeapObject(ret);
    });
    imports.wbg.__wbg_requestAnimationFrame_96f88ce2d311332e = handleError(function (arg0, arg1) {
      var ret = getObject(arg0).requestAnimationFrame(getObject(arg1));
      return ret;
    });
    imports.wbg.__wbg_createElement_467bb064d2ae5833 = handleError(function (arg0, arg1, arg2) {
      var ret = getObject(arg0).createElement(getStringFromWasm0(arg1, arg2));
      return addHeapObject(ret);
    });

    imports.wbg.__wbg_clientX_48aae9fc88d6ea69 = function (arg0) {
      var ret = getObject(arg0).clientX;
      return ret;
    };

    imports.wbg.__wbg_clientY_b23802d9e0dd2c51 = function (arg0) {
      var ret = getObject(arg0).clientY;
      return ret;
    };

    imports.wbg.__wbg_buttons_d9a487d62a2bcfad = function (arg0) {
      var ret = getObject(arg0).buttons;
      return ret;
    };

    imports.wbg.__wbg_encrypt_3eac7f61933c3be9 = handleError(function (arg0, arg1, arg2, arg3) {
      var ret = getObject(arg0).encrypt(getObject(arg1), getObject(arg2), getObject(arg3));
      return addHeapObject(ret);
    });
    imports.wbg.__wbg_importKey_370896d933eba99c = handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
      var ret = getObject(arg0).importKey(
        getStringFromWasm0(arg1, arg2),
        getObject(arg3),
        getObject(arg4),
        arg5 !== 0,
        getObject(arg6),
      );
      return addHeapObject(ret);
    });

    imports.wbg.__wbg_deltaX_91eab99c5941b593 = function (arg0) {
      var ret = getObject(arg0).deltaX;
      return ret;
    };

    imports.wbg.__wbg_deltaY_ba4bc93322183cab = function (arg0) {
      var ret = getObject(arg0).deltaY;
      return ret;
    };

    imports.wbg.__wbg_subtle_a33b474f137433b4 = function (arg0) {
      var ret = getObject(arg0).subtle;
      return addHeapObject(ret);
    };

    imports.wbg.__wbg_getRandomValues_bd83b9bca41f01e4 = handleError(function (arg0, arg1, arg2) {
      var ret = getObject(arg0).getRandomValues(getArrayU8FromWasm0(arg1, arg2));
      return addHeapObject(ret);
    });

    imports.wbg.__wbg_clientX_bc61648c02723dc7 = function (arg0) {
      var ret = getObject(arg0).clientX;
      return ret;
    };

    imports.wbg.__wbg_clientY_67b12bba9c15ace2 = function (arg0) {
      var ret = getObject(arg0).clientY;
      return ret;
    };

    imports.wbg.__wbg_length_4c6909494a0e02f9 = function (arg0) {
      var ret = getObject(arg0).length;
      return ret;
    };

    imports.wbg.__wbg_item_bb8a8818d4856ef0 = function (arg0, arg1) {
      var ret = getObject(arg0).item(arg1 >>> 0);
      return isLikeNone(ret) ? 0 : addHeapObject(ret);
    };

    imports.wbg.__wbg_setAttribute_02daabbc925a51e3 = handleError(function (arg0, arg1, arg2, arg3, arg4) {
      getObject(arg0).setAttribute(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
    });

    imports.wbg.__wbg_instanceof_WebGlRenderingContext_dca65729c7187d57 = function (arg0) {
      var ret = _instanceof(getObject(arg0), WebGLRenderingContext);

      return ret;
    };

    imports.wbg.__wbg_bufferData_e135b678b6ef2433 = function (arg0, arg1, arg2, arg3) {
      getObject(arg0).bufferData(arg1 >>> 0, getObject(arg2), arg3 >>> 0);
    };

    imports.wbg.__wbg_attachShader_9958cc9636fc8494 = function (arg0, arg1, arg2) {
      getObject(arg0).attachShader(getObject(arg1), getObject(arg2));
    };

    imports.wbg.__wbg_bindBuffer_c96c99b259d952f4 = function (arg0, arg1, arg2) {
      getObject(arg0).bindBuffer(arg1 >>> 0, getObject(arg2));
    };

    imports.wbg.__wbg_clear_ec5c1c21ed3b2fe2 = function (arg0, arg1) {
      getObject(arg0).clear(arg1 >>> 0);
    };

    imports.wbg.__wbg_clearColor_b9e0f7e215dc534e = function (arg0, arg1, arg2, arg3, arg4) {
      getObject(arg0).clearColor(arg1, arg2, arg3, arg4);
    };

    imports.wbg.__wbg_compileShader_82966bc7f1d070fe = function (arg0, arg1) {
      getObject(arg0).compileShader(getObject(arg1));
    };

    imports.wbg.__wbg_createBuffer_501da6aef1c4b91c = function (arg0) {
      var ret = getObject(arg0).createBuffer();
      return isLikeNone(ret) ? 0 : addHeapObject(ret);
    };

    imports.wbg.__wbg_createProgram_531dab3c15c28e4f = function (arg0) {
      var ret = getObject(arg0).createProgram();
      return isLikeNone(ret) ? 0 : addHeapObject(ret);
    };

    imports.wbg.__wbg_createShader_376b269548a48c7a = function (arg0, arg1) {
      var ret = getObject(arg0).createShader(arg1 >>> 0);
      return isLikeNone(ret) ? 0 : addHeapObject(ret);
    };

    imports.wbg.__wbg_drawArrays_1c6a2bff627558ed = function (arg0, arg1, arg2, arg3) {
      getObject(arg0).drawArrays(arg1 >>> 0, arg2, arg3);
    };

    imports.wbg.__wbg_enableVertexAttribArray_0f8b0b1592940e3f = function (arg0, arg1) {
      getObject(arg0).enableVertexAttribArray(arg1 >>> 0);
    };

    imports.wbg.__wbg_getProgramInfoLog_5def5bb3d8d30e1f = function (arg0, arg1, arg2) {
      var ret = getObject(arg1).getProgramInfoLog(getObject(arg2));
      var ptr0 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      var len0 = WASM_VECTOR_LEN;
      getInt32Memory0()[arg0 / 4 + 1] = len0;
      getInt32Memory0()[arg0 / 4 + 0] = ptr0;
    };

    imports.wbg.__wbg_getProgramParameter_c021157c5817259f = function (arg0, arg1, arg2) {
      var ret = getObject(arg0).getProgramParameter(getObject(arg1), arg2 >>> 0);
      return addHeapObject(ret);
    };

    imports.wbg.__wbg_getShaderInfoLog_b619769ff40aac70 = function (arg0, arg1, arg2) {
      var ret = getObject(arg1).getShaderInfoLog(getObject(arg2));
      var ptr0 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      var len0 = WASM_VECTOR_LEN;
      getInt32Memory0()[arg0 / 4 + 1] = len0;
      getInt32Memory0()[arg0 / 4 + 0] = ptr0;
    };

    imports.wbg.__wbg_getShaderParameter_d03718a8c98a4d23 = function (arg0, arg1, arg2) {
      var ret = getObject(arg0).getShaderParameter(getObject(arg1), arg2 >>> 0);
      return addHeapObject(ret);
    };

    imports.wbg.__wbg_linkProgram_9e60adcb42d34c3c = function (arg0, arg1) {
      getObject(arg0).linkProgram(getObject(arg1));
    };

    imports.wbg.__wbg_shaderSource_c208cc7a688e8923 = function (arg0, arg1, arg2, arg3) {
      getObject(arg0).shaderSource(getObject(arg1), getStringFromWasm0(arg2, arg3));
    };

    imports.wbg.__wbg_useProgram_c4a6df84383cd1a6 = function (arg0, arg1) {
      getObject(arg0).useProgram(getObject(arg1));
    };

    imports.wbg.__wbg_vertexAttribPointer_5660aa1f2b819de1 = function (arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
      getObject(arg0).vertexAttribPointer(arg1 >>> 0, arg2, arg3 >>> 0, arg4 !== 0, arg5, arg6);
    };

    imports.wbg.__wbg_addEventListener_fe52a115589ccc2c = handleError(function (arg0, arg1, arg2, arg3) {
      getObject(arg0).addEventListener(getStringFromWasm0(arg1, arg2), getObject(arg3));
    });

    imports.wbg.__wbg_instanceof_HtmlCanvasElement_308a7fa689ff20ef = function (arg0) {
      var ret = _instanceof(getObject(arg0), HTMLCanvasElement);

      return ret;
    };

    imports.wbg.__wbg_getContext_554fc171434d411b = handleError(function (arg0, arg1, arg2) {
      var ret = getObject(arg0).getContext(getStringFromWasm0(arg1, arg2));
      return isLikeNone(ret) ? 0 : addHeapObject(ret);
    });
    imports.wbg.__wbg_toDataURL_ca175b3d0bb6f5d9 = handleError(function (arg0, arg1) {
      var ret = getObject(arg1).toDataURL();
      var ptr0 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      var len0 = WASM_VECTOR_LEN;
      getInt32Memory0()[arg0 / 4 + 1] = len0;
      getInt32Memory0()[arg0 / 4 + 0] = ptr0;
    });
    imports.wbg.__wbg_cookie_eb31c284e2ed620b = handleError(function (arg0, arg1) {
      var ret = getObject(arg1).cookie;
      var ptr0 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      var len0 = WASM_VECTOR_LEN;
      getInt32Memory0()[arg0 / 4 + 1] = len0;
      getInt32Memory0()[arg0 / 4 + 0] = ptr0;
    });

    imports.wbg.__wbg_keyCode_e19b105e5d2d09d5 = function (arg0) {
      var ret = getObject(arg0).keyCode;
      return ret;
    };

    imports.wbg.__wbg_shiftKey_0924a6b92b68d3f6 = function (arg0) {
      var ret = getObject(arg0).shiftKey;
      return ret;
    };

    imports.wbg.__wbg_alpha_71e14e01b1c605a6 = function (arg0, arg1) {
      var ret = getObject(arg1).alpha;
      getFloat64Memory0()[arg0 / 8 + 1] = isLikeNone(ret) ? 0 : ret;
      getInt32Memory0()[arg0 / 4 + 0] = !isLikeNone(ret);
    };

    imports.wbg.__wbg_beta_f48a7d1a10feff4e = function (arg0, arg1) {
      var ret = getObject(arg1).beta;
      getFloat64Memory0()[arg0 / 8 + 1] = isLikeNone(ret) ? 0 : ret;
      getInt32Memory0()[arg0 / 4 + 0] = !isLikeNone(ret);
    };

    imports.wbg.__wbg_gamma_eb5fbdd72123221e = function (arg0, arg1) {
      var ret = getObject(arg1).gamma;
      getFloat64Memory0()[arg0 / 8 + 1] = isLikeNone(ret) ? 0 : ret;
      getInt32Memory0()[arg0 / 4 + 0] = !isLikeNone(ret);
    };

    imports.wbg.__wbg_touches_ea1e29cf107bf92b = function (arg0) {
      var ret = getObject(arg0).touches;
      return addHeapObject(ret);
    };

    imports.wbg.__wbg_next_7a1e3e5ba77a5417 = handleError(function (arg0) {
      var ret = getObject(arg0).next();
      return addHeapObject(ret);
    });

    imports.wbg.__wbg_done_179f9d81f2c93943 = function (arg0) {
      var ret = getObject(arg0).done;
      return ret;
    };

    imports.wbg.__wbg_value_dd36c45a14714446 = function (arg0) {
      var ret = getObject(arg0).value;
      return addHeapObject(ret);
    };

    imports.wbg.__wbg_get_fa38f22e54fe1ab1 = handleError(function (arg0, arg1) {
      var ret = Reflect.get(getObject(arg0), getObject(arg1));
      return addHeapObject(ret);
    });
    imports.wbg.__wbg_call_20c04382b27a4486 = handleError(function (arg0, arg1) {
      var ret = getObject(arg0).call(getObject(arg1));
      return addHeapObject(ret);
    });

    imports.wbg.__wbg_new_a938277eeb06668d = function () {
      var ret = new Array();
      return addHeapObject(ret);
    };

    imports.wbg.__wbg_push_2bfc5fcfa4d4389d = function (arg0, arg1) {
      var ret = getObject(arg0).push(getObject(arg1));
      return ret;
    };

    imports.wbg.__wbg_values_04df67902f0aa20f = function (arg0) {
      var ret = getObject(arg0).values();
      return addHeapObject(ret);
    };

    imports.wbg.__wbg_newnoargs_bfddd41728ab0b9c = function (arg0, arg1) {
      var ret = new Function(getStringFromWasm0(arg0, arg1));
      return addHeapObject(ret);
    };

    imports.wbg.__wbg_now_40a39f1fea2317e3 = function () {
      var ret = Date.now();
      return ret;
    };

    imports.wbg.__wbg_new_f46e6afe0b8a862e = function () {
      var ret = new Object();
      return addHeapObject(ret);
    };

    imports.wbg.__wbg_exec_0847b50db1960a9b = function (arg0, arg1, arg2) {
      var ret = getObject(arg0).exec(getStringFromWasm0(arg1, arg2));
      return isLikeNone(ret) ? 0 : addHeapObject(ret);
    };

    imports.wbg.__wbg_new_ad3a28429d2566a0 = function (arg0, arg1, arg2, arg3) {
      var ret = new RegExp(getStringFromWasm0(arg0, arg1), getStringFromWasm0(arg2, arg3));
      return addHeapObject(ret);
    };

    imports.wbg.__wbg_new_261626435fed913c = function (arg0, arg1) {
      try {
        var state0 = {
          a: arg0,
          b: arg1,
        };

        var cb0 = function cb0(arg0, arg1) {
          var a = state0.a;
          state0.a = 0;

          try {
            return __wbg_adapter_165(a, state0.b, arg0, arg1);
          } finally {
            state0.a = a;
          }
        };

        var ret = new Promise(cb0);
        return addHeapObject(ret);
      } finally {
        state0.a = state0.b = 0;
      }
    };

    imports.wbg.__wbg_resolve_430b2f40a51592cc = function (arg0) {
      var ret = Promise.resolve(getObject(arg0));
      return addHeapObject(ret);
    };

    imports.wbg.__wbg_then_a9485ea9ef567f90 = function (arg0, arg1) {
      var ret = getObject(arg0).then(getObject(arg1));
      return addHeapObject(ret);
    };

    imports.wbg.__wbg_then_b114127b40814c36 = function (arg0, arg1, arg2) {
      var ret = getObject(arg0).then(getObject(arg1), getObject(arg2));
      return addHeapObject(ret);
    };

    imports.wbg.__wbg_self_944d201f31e01c91 = handleError(function () {
      var ret = self.self;
      return addHeapObject(ret);
    });
    imports.wbg.__wbg_window_993fd51731b86960 = handleError(function () {
      var ret = window.window;
      return addHeapObject(ret);
    });
    imports.wbg.__wbg_globalThis_8379563d70fab135 = handleError(function () {
      var ret = globalThis.globalThis;
      return addHeapObject(ret);
    });
    imports.wbg.__wbg_global_073eb4249a3a8c12 = handleError(function () {
      var ret = global.global;
      return addHeapObject(ret);
    });

    imports.wbg.__wbindgen_is_undefined = function (arg0) {
      var ret = getObject(arg0) === undefined;
      return ret;
    };

    imports.wbg.__wbg_buffer_985803c87989344b = function (arg0) {
      var ret = getObject(arg0).buffer;
      return addHeapObject(ret);
    };

    imports.wbg.__wbg_newwithbyteoffsetandlength_36d42f1c91e7259d = function (arg0, arg1, arg2) {
      var ret = new Uint8Array(getObject(arg0), arg1 >>> 0, arg2 >>> 0);
      return addHeapObject(ret);
    };

    imports.wbg.__wbg_length_32e166b42b85060a = function (arg0) {
      var ret = getObject(arg0).length;
      return ret;
    };

    imports.wbg.__wbg_new_b7e3d6adc8b9377a = function (arg0) {
      var ret = new Uint8Array(getObject(arg0));
      return addHeapObject(ret);
    };

    imports.wbg.__wbg_set_66e888cef8f00a73 = function (arg0, arg1, arg2) {
      getObject(arg0).set(getObject(arg1), arg2 >>> 0);
    };

    imports.wbg.__wbg_newwithbyteoffsetandlength_3c83a6445776097f = function (arg0, arg1, arg2) {
      var ret = new Float32Array(getObject(arg0), arg1 >>> 0, arg2 >>> 0);
      return addHeapObject(ret);
    };

    imports.wbg.__wbg_buffer_4f0ba77e90f96e9d = function (arg0) {
      var ret = getObject(arg0).buffer;
      return addHeapObject(ret);
    };

    imports.wbg.__wbg_ownKeys_8a63b9d67c805cfd = handleError(function (arg0) {
      var ret = Reflect.ownKeys(getObject(arg0));
      return addHeapObject(ret);
    });
    imports.wbg.__wbg_set_6db0a4cb6e322f85 = handleError(function (arg0, arg1, arg2) {
      var ret = Reflect.set(getObject(arg0), getObject(arg1), getObject(arg2));
      return ret;
    });

    imports.wbg.__wbindgen_string_get = function (arg0, arg1) {
      var obj = getObject(arg1);
      var ret = typeof obj === "string" ? obj : undefined;
      var ptr0 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      var len0 = WASM_VECTOR_LEN;
      getInt32Memory0()[arg0 / 4 + 1] = len0;
      getInt32Memory0()[arg0 / 4 + 0] = ptr0;
    };

    imports.wbg.__wbindgen_boolean_get = function (arg0) {
      var v = getObject(arg0);
      var ret = typeof v === "boolean" ? (v ? 1 : 0) : 2;
      return ret;
    };

    imports.wbg.__wbindgen_debug_string = function (arg0, arg1) {
      var ret = debugString(getObject(arg1));
      var ptr0 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
      var len0 = WASM_VECTOR_LEN;
      getInt32Memory0()[arg0 / 4 + 1] = len0;
      getInt32Memory0()[arg0 / 4 + 0] = ptr0;
    };

    imports.wbg.__wbindgen_throw = function (arg0, arg1) {
      throw new Error(getStringFromWasm0(arg0, arg1));
    };

    imports.wbg.__wbindgen_memory = function () {
      var ret = wasm.memory;
      return addHeapObject(ret);
    };

    imports.wbg.__wbindgen_closure_wrapper191 = function (arg0, arg1, arg2) {
      var ret = makeMutClosure(arg0, arg1, 64, __wbg_adapter_26);
      return addHeapObject(ret);
    };

    imports.wbg.__wbindgen_closure_wrapper193 = function (arg0, arg1, arg2) {
      var ret = makeMutClosure(arg0, arg1, 64, __wbg_adapter_32);
      return addHeapObject(ret);
    };

    imports.wbg.__wbindgen_closure_wrapper220 = function (arg0, arg1, arg2) {
      var ret = makeMutClosure(arg0, arg1, 73, __wbg_adapter_29);
      return addHeapObject(ret);
    };

    if (
      typeof input === "string" ||
      (typeof Request === "function" && _instanceof(input, Request)) ||
      (typeof URL === "function" && _instanceof(input, URL))
    ) {
      input = fetch(input);
    }

    var _await$load = await load(await input, imports),
      instance = _await$load.instance,
      module = _await$load.module;

    wasm = instance.exports;
    init.__wbindgen_wasm_module = module;

    wasm.__wbindgen_start();

    return wasm;
  }

  wasm_bindgen = Object.assign(init, __exports);
})();

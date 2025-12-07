{
  "targets": [
    {
      "target_name": "pcd_parser",
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "sources": [
        "native/node_addon/bindings.cpp"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "native/pcd_parser/include"
      ],
      "libraries": [
        "../native/pcd_parser/build/libpcd_parser.dylib",
        "../native/pcd_parser/build/liblzf.dylib"
      ],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
      "conditions": [
        ["OS=='mac'", {
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "CLANG_CXX_LIBRARY": "libc++",
            "MACOSX_DEPLOYMENT_TARGET": "15.0"
          }
        }],
        ["OS=='linux'", {
          "cflags_cc": ["-std=c++17", "-fexceptions"],
          "libraries": [
            "../native/pcd_parser/build/libpcd_parser.so",
            "../native/pcd_parser/build/liblzf.so"
          ]
        }],
        ["OS=='win'", {
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1
            }
          }
        }]
      ]
    }
  ]
}

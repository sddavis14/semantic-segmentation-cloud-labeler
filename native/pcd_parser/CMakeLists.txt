cmake_minimum_required(VERSION 3.14)
project(pcd_parser VERSION 1.0.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Build position-independent code for shared library
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# macOS: use @loader_path for install_name so dylibs can be found at runtime
if(APPLE)
    set(CMAKE_INSTALL_RPATH "@loader_path")
    set(CMAKE_BUILD_WITH_INSTALL_RPATH TRUE)
    set(CMAKE_MACOSX_RPATH TRUE)
endif()

# Fetch liblzf
include(FetchContent)
FetchContent_Declare(
    liblzf
    GIT_REPOSITORY https://github.com/nemequ/liblzf.git
    GIT_TAG master
)
FetchContent_MakeAvailable(liblzf)

# Build liblzf as shared library
add_library(lzf SHARED
    ${liblzf_SOURCE_DIR}/lzf_c.c
    ${liblzf_SOURCE_DIR}/lzf_d.c
)
target_include_directories(lzf PUBLIC ${liblzf_SOURCE_DIR})

# Library target - shared library
add_library(pcd_parser SHARED
    src/pcd_parser.cpp
)

target_include_directories(pcd_parser
    PUBLIC
        $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
        $<INSTALL_INTERFACE:include>
)

target_link_libraries(pcd_parser PRIVATE lzf)

# Enable testing
option(BUILD_TESTS "Build unit tests" ON)

if(BUILD_TESTS)
    enable_testing()
    add_subdirectory(tests)
endif()

include(FetchContent)

# Fetch GoogleTest
FetchContent_Declare(
    googletest
    GIT_REPOSITORY https://github.com/google/googletest.git
    GIT_TAG v1.14.0
)
FetchContent_MakeAvailable(googletest)

# Test executable
add_executable(pcd_parser_tests
    test_pcd_parser.cpp
)

target_link_libraries(pcd_parser_tests
    PRIVATE
        pcd_parser
        GTest::gtest_main
)

include(GoogleTest)
gtest_discover_tests(pcd_parser_tests)

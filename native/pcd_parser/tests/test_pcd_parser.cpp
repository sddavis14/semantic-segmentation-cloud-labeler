#include "pcd_parser/pcd_parser.h"
#include <cmath>
#include <fstream>
#include <gtest/gtest.h>

// Test that PCDHeader calculates point size correctly
TEST(PCDHeader, PointSizeCalculation) {
  pcd::PCDHeader header;
  header.addField("x", 4, 'F', 1);
  header.addField("y", 4, 'F', 1);
  header.addField("z", 4, 'F', 1);
  header.addField("label", 4, 'U', 1);

  EXPECT_EQ(header.getPointSize(), 16);
}

// Test field index lookup
TEST(PCDHeader, FindField) {
  pcd::PCDHeader header;
  header.addField("x", 4, 'F', 1);
  header.addField("y", 4, 'F', 1);
  header.addField("z", 4, 'F', 1);
  header.addField("intensity", 4, 'F', 1);

  EXPECT_EQ(header.findField("x"), 0);
  EXPECT_EQ(header.findField("intensity"), 3);
  EXPECT_EQ(header.findField("nonexistent"), -1);
}

// Test FieldInfo storage creation
TEST(FieldInfo, CreateStorage) {
  pcd::FieldInfo floatField{"x", 4, 'F', 1};
  auto floatStorage = floatField.createStorage();
  EXPECT_TRUE(std::holds_alternative<std::vector<float>>(floatStorage));

  pcd::FieldInfo uint8Field{"r", 1, 'U', 1};
  auto uint8Storage = uint8Field.createStorage();
  EXPECT_TRUE(std::holds_alternative<std::vector<uint8_t>>(uint8Storage));

  pcd::FieldInfo uint32Field{"label", 4, 'U', 1};
  auto uint32Storage = uint32Field.createStorage();
  EXPECT_TRUE(std::holds_alternative<std::vector<uint32_t>>(uint32Storage));
}

// Test PCDData position extraction
TEST(PCDData, GetPositions) {
  pcd::PCDData data;
  data.header.addField("x", 4, 'F', 1);
  data.header.addField("y", 4, 'F', 1);
  data.header.addField("z", 4, 'F', 1);

  std::vector<float> xs = {1.0f, 2.0f, 3.0f};
  std::vector<float> ys = {4.0f, 5.0f, 6.0f};
  std::vector<float> zs = {7.0f, 8.0f, 9.0f};

  data.fieldData.push_back(xs);
  data.fieldData.push_back(ys);
  data.fieldData.push_back(zs);

  auto positions = data.getPositions();
  EXPECT_EQ(positions.size(), 9);
  EXPECT_FLOAT_EQ(positions[0], 1.0f); // x0
  EXPECT_FLOAT_EQ(positions[1], 4.0f); // y0
  EXPECT_FLOAT_EQ(positions[2], 7.0f); // z0
  EXPECT_FLOAT_EQ(positions[3], 2.0f); // x1
  EXPECT_FLOAT_EQ(positions[4], 5.0f); // y1
  EXPECT_FLOAT_EQ(positions[5], 8.0f); // z1
}

// Test label extraction and update
TEST(PCDData, Labels) {
  pcd::PCDData data;
  data.header.addField("x", 4, 'F', 1);
  data.header.addField("label", 4, 'U', 1);

  std::vector<float> xs = {1.0f, 2.0f, 3.0f};
  std::vector<uint32_t> labels = {0, 1, 2};

  data.fieldData.push_back(xs);
  data.fieldData.push_back(labels);

  auto extractedLabels = data.getLabels();
  EXPECT_EQ(extractedLabels.size(), 3);
  EXPECT_EQ(extractedLabels[0], 0);
  EXPECT_EQ(extractedLabels[1], 1);
  EXPECT_EQ(extractedLabels[2], 2);

  // Update labels
  std::vector<uint32_t> newLabels = {5, 6, 7};
  data.setLabels(newLabels);

  auto updatedLabels = data.getLabels();
  EXPECT_EQ(updatedLabels[0], 5);
  EXPECT_EQ(updatedLabels[1], 6);
  EXPECT_EQ(updatedLabels[2], 7);
}

// Test numPoints calculation
TEST(PCDData, NumPoints) {
  pcd::PCDData data;
  data.header.addField("x", 4, 'F', 1);
  data.header.addField("y", 4, 'F', 1);

  std::vector<float> xs = {1.0f, 2.0f, 3.0f, 4.0f, 5.0f};
  std::vector<float> ys = {1.0f, 2.0f, 3.0f, 4.0f, 5.0f};

  data.fieldData.push_back(xs);
  data.fieldData.push_back(ys);

  EXPECT_EQ(data.numPoints(), 5);
}

int main(int argc, char **argv) {
  testing::InitGoogleTest(&argc, argv);
  return RUN_ALL_TESTS();
}

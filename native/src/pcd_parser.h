#ifndef PCD_PARSER_H
#define PCD_PARSER_H

#include <algorithm>
#include <cstdint>
#include <cstring>
#include <fstream>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <variant>
#include <vector>

namespace pcd {

// Column-oriented field storage for better performance
// Each field is stored as a contiguous vector of the appropriate type
using FieldData = std::variant<std::vector<int8_t>, std::vector<uint8_t>,
                               std::vector<int16_t>, std::vector<uint16_t>,
                               std::vector<int32_t>, std::vector<uint32_t>,
                               std::vector<float>, std::vector<double>>;

// Field metadata
struct FieldInfo {
  std::string name;
  int size;  // 1, 2, 4, or 8 bytes
  char type; // I (signed int), U (unsigned int), F (float)
  int count; // Usually 1, but can be more for packed fields

  // Create an empty FieldData of the correct type
  FieldData createStorage() const {
    switch (type) {
    case 'I':
      switch (size) {
      case 1:
        return std::vector<int8_t>{};
      case 2:
        return std::vector<int16_t>{};
      case 4:
        return std::vector<int32_t>{};
      }
      break;
    case 'U':
      switch (size) {
      case 1:
        return std::vector<uint8_t>{};
      case 2:
        return std::vector<uint16_t>{};
      case 4:
        return std::vector<uint32_t>{};
      }
      break;
    case 'F':
      if (size == 4)
        return std::vector<float>{};
      if (size == 8)
        return std::vector<double>{};
      break;
    }
    return std::vector<float>{}; // Default fallback
  }
};

// PCD file header
struct PCDHeader {
  std::string version = "0.7";
  std::vector<FieldInfo> fields;
  int width = 0;
  int height = 1;
  std::string viewpoint = "0 0 0 1 0 0 0";
  int points = 0;
  std::string dataType = "ascii"; // ascii, binary, binary_compressed

  // Find field index by name (case-insensitive)
  int findField(const std::string &name) const {
    std::string lowerName = name;
    std::transform(lowerName.begin(), lowerName.end(), lowerName.begin(),
                   ::tolower);

    for (size_t i = 0; i < fields.size(); i++) {
      std::string fieldLower = fields[i].name;
      std::transform(fieldLower.begin(), fieldLower.end(), fieldLower.begin(),
                     ::tolower);
      if (fieldLower == lowerName)
        return static_cast<int>(i);
    }
    return -1;
  }

  // Get size of one point in bytes
  int getPointSize() const {
    int size = 0;
    for (const auto &f : fields) {
      size += f.size * f.count;
    }
    return size;
  }

  // Add a new field
  void addField(const std::string &name, int size, char type, int count = 1) {
    fields.push_back({name, size, type, count});
  }

  // Get field names as vector
  std::vector<std::string> getFieldNames() const {
    std::vector<std::string> names;
    names.reserve(fields.size());
    for (const auto &f : fields) {
      names.push_back(f.name);
    }
    return names;
  }
};

// Main PCD data structure - column-oriented storage
struct PCDData {
  PCDHeader header;
  std::vector<FieldData> fieldData; // One entry per field in header

  size_t numPoints() const {
    if (fieldData.empty())
      return 0;
    return std::visit([](const auto &vec) { return vec.size(); }, fieldData[0]);
  }

  // Get field data by name, converted to doubles for uniform processing
  std::vector<double> getFieldAsDouble(const std::string &fieldName) const {
    int idx = header.findField(fieldName);
    if (idx < 0 || idx >= static_cast<int>(fieldData.size())) {
      return {};
    }

    return std::visit(
        [](const auto &vec) -> std::vector<double> {
          std::vector<double> result;
          result.reserve(vec.size());
          for (const auto &v : vec) {
            result.push_back(static_cast<double>(v));
          }
          return result;
        },
        fieldData[idx]);
  }

  // Get field data by index as Float32 (for JavaScript TypedArrays)
  std::vector<float> getFieldAsFloat(int idx) const {
    if (idx < 0 || idx >= static_cast<int>(fieldData.size())) {
      return {};
    }

    return std::visit(
        [](const auto &vec) -> std::vector<float> {
          std::vector<float> result;
          result.reserve(vec.size());
          for (const auto &v : vec) {
            result.push_back(static_cast<float>(v));
          }
          return result;
        },
        fieldData[idx]);
  }

  // Get labels as uint32
  std::vector<uint32_t> getLabels() const {
    int idx = header.findField("label");
    if (idx < 0) {
      // Return zeros if no label field
      return std::vector<uint32_t>(numPoints(), 0);
    }

    return std::visit(
        [](const auto &vec) -> std::vector<uint32_t> {
          std::vector<uint32_t> result;
          result.reserve(vec.size());
          for (const auto &v : vec) {
            result.push_back(static_cast<uint32_t>(v));
          }
          return result;
        },
        fieldData[idx]);
  }

  // Set labels - adds field if not exists
  void setLabels(const std::vector<uint32_t> &labels) {
    int idx = header.findField("label");
    if (idx < 0) {
      // Add label field
      header.addField("label", 4, 'U', 1);
      fieldData.push_back(std::vector<uint32_t>(labels));
    } else {
      fieldData[idx] = labels;
    }
  }

  // Get X, Y, Z as interleaved positions for Three.js
  std::vector<float> getPositions() const {
    int xIdx = header.findField("x");
    int yIdx = header.findField("y");
    int zIdx = header.findField("z");

    if (xIdx < 0 || yIdx < 0 || zIdx < 0)
      return {};

    auto xData = getFieldAsFloat(xIdx);
    auto yData = getFieldAsFloat(yIdx);
    auto zData = getFieldAsFloat(zIdx);

    size_t n = std::min({xData.size(), yData.size(), zData.size()});
    std::vector<float> positions(n * 3);

    for (size_t i = 0; i < n; i++) {
      positions[i * 3] = xData[i];
      positions[i * 3 + 1] = yData[i];
      positions[i * 3 + 2] = zData[i];
    }

    return positions;
  }
};

class PCDParser {
public:
  // Parse a PCD file
  static PCDData parse(const std::string &filepath);

  // Write PCD data to file
  static void write(const std::string &filepath, const PCDData &data,
                    bool binary = false);
  static void write(const std::string &filepath, const PCDData &data,
                    const std::string &format);

  // Update only labels in an existing file (preserves all other fields)
  static void updateLabels(const std::string &filepath,
                           const std::vector<uint32_t> &labels,
                           bool binary = false);
  static void updateLabelsWithFormat(const std::string &filepath,
                                     const std::vector<uint32_t> &labels,
                                     const std::string &format);

  // Convert file format (ascii <-> binary <-> binary_compressed)
  static void convertFormat(const std::string &filepath, bool toBinary);
  static void convertFormat(const std::string &filepath,
                            const std::string &format);

private:
  static PCDHeader parseHeader(std::istream &stream);
  static std::vector<std::string> splitString(const std::string &str,
                                              char delim = ' ');
  static void parseAsciiData(std::istream &stream, PCDData &data);
  static void parseBinaryData(std::istream &stream, PCDData &data);
  static void parseBinaryCompressedData(std::istream &stream, PCDData &data);
  static void writeAscii(std::ostream &stream, const PCDData &data);
  static void writeBinary(std::ostream &stream, const PCDData &data);
  static void writeBinaryCompressed(std::ostream &stream, const PCDData &data);
};

} // namespace pcd

#endif // PCD_PARSER_H

#include "pcd_parser.h"
#include <iomanip>
#include <iostream>

// LZF decompression implementation for binary_compressed PCD files
// Based on Marc Lehmann's liblzf (BSD license)
static size_t lzfDecompress(const void *in_data, size_t in_len, void *out_data,
                            size_t out_len) {
  const uint8_t *ip = static_cast<const uint8_t *>(in_data);
  const uint8_t *ip_end = ip + in_len;
  uint8_t *op = static_cast<uint8_t *>(out_data);
  uint8_t *op_end = op + out_len;

  while (ip < ip_end) {
    unsigned int ctrl = *ip++;

    if (ctrl < 32) {
      // Literal run
      unsigned int len = ctrl + 1;
      if (op + len > op_end || ip + len > ip_end) {
        return 0; // Output buffer overflow
      }
      std::memcpy(op, ip, len);
      ip += len;
      op += len;
    } else {
      // Back reference
      unsigned int len = (ctrl >> 5) + 2;
      unsigned int off = ((ctrl & 0x1f) << 8) + 1;

      if (len == 9) {
        len += *ip++;
      }
      off += *ip++;

      if (op + len > op_end || op - off < static_cast<uint8_t *>(out_data)) {
        return 0; // Invalid back reference
      }

      // Copy with overlap handling
      const uint8_t *ref = op - off;
      for (unsigned int i = 0; i < len; i++) {
        *op++ = *ref++;
      }
    }
  }

  return static_cast<size_t>(op - static_cast<uint8_t *>(out_data));
}

// LZF compression implementation for writing binary_compressed PCD files
// Based on Marc Lehmann's liblzf (BSD license)
static size_t lzfCompress(const void *in_data, size_t in_len, void *out_data,
                          size_t out_len) {
  const uint8_t *ip = static_cast<const uint8_t *>(in_data);
  const uint8_t *ip_end = ip + in_len;
  uint8_t *op = static_cast<uint8_t *>(out_data);
  uint8_t *op_end = op + out_len;

  // Hash table for finding matches
  const size_t HTAB_SIZE = 1 << 14; // 16384
  std::vector<const uint8_t *> htab(HTAB_SIZE, nullptr);

  const uint8_t *lit = ip; // Start of literal run

  if (in_len < 3) {
    // Data too small to compress, just copy
    if (in_len && op + in_len + 1 <= op_end) {
      *op++ = static_cast<uint8_t>(in_len - 1);
      std::memcpy(op, in_data, in_len);
      return in_len + 1;
    }
    return 0;
  }

  ip++; // Start at second byte

  while (ip < ip_end - 2) {
    // Compute hash
    uint32_t hash = ((ip[0] << 8) | ip[1]) ^ (ip[2] << 5);
    hash = (hash >> 2) ^ hash;
    hash &= HTAB_SIZE - 1;

    const uint8_t *ref = htab[hash];
    htab[hash] = ip;

    // Check for match
    size_t off;
    if (ref && (off = ip - ref) <= 8191 &&
        ref >= static_cast<const uint8_t *>(in_data) && ref[0] == ip[0] &&
        ref[1] == ip[1] && ref[2] == ip[2]) {

      // Found match, output literals first
      size_t lit_len = ip - lit;
      if (lit_len > 0) {
        // Output literal run
        if (op + lit_len + 1 >= op_end)
          return 0;

        while (lit_len > 32) {
          *op++ = 31; // 32 literals
          std::memcpy(op, lit, 32);
          op += 32;
          lit += 32;
          lit_len -= 32;
        }
        if (lit_len > 0) {
          *op++ = static_cast<uint8_t>(lit_len - 1);
          std::memcpy(op, lit, lit_len);
          op += lit_len;
        }
      }

      // Find match length
      size_t len = 3;
      size_t max_len =
          std::min(static_cast<size_t>(ip_end - ip), static_cast<size_t>(264));
      while (len < max_len && ip[len] == ref[len]) {
        len++;
      }

      // Output back reference
      if (op + 2 >= op_end)
        return 0;

      if (len <= 8) {
        *op++ = static_cast<uint8_t>(((len - 2) << 5) | ((off - 1) >> 8));
        *op++ = static_cast<uint8_t>((off - 1) & 0xFF);
      } else {
        *op++ = static_cast<uint8_t>((7 << 5) | ((off - 1) >> 8));
        *op++ = static_cast<uint8_t>(len - 9);
        if (op >= op_end)
          return 0;
        *op++ = static_cast<uint8_t>((off - 1) & 0xFF);
      }

      ip += len;
      lit = ip;
    } else {
      ip++;
    }
  }

  // Output remaining literals
  size_t lit_len = ip_end - lit;
  if (lit_len > 0) {
    if (op + lit_len + ((lit_len + 31) / 32) >= op_end)
      return 0;

    while (lit_len > 32) {
      *op++ = 31;
      std::memcpy(op, lit, 32);
      op += 32;
      lit += 32;
      lit_len -= 32;
    }
    if (lit_len > 0) {
      *op++ = static_cast<uint8_t>(lit_len - 1);
      std::memcpy(op, lit, lit_len);
      op += lit_len;
    }
  }

  return static_cast<size_t>(op - static_cast<uint8_t *>(out_data));
}

namespace pcd {

std::vector<std::string> PCDParser::splitString(const std::string &str,
                                                char delim) {
  std::vector<std::string> tokens;
  std::stringstream ss(str);
  std::string token;
  while (std::getline(ss, token, delim)) {
    if (!token.empty() && token.find_first_not_of(" \t") != std::string::npos) {
      tokens.push_back(token);
    }
  }
  return tokens;
}

PCDHeader PCDParser::parseHeader(std::istream &stream) {
  PCDHeader header;
  std::string line;
  std::vector<std::string> fieldNames;
  std::vector<int> sizes;
  std::vector<char> types;
  std::vector<int> counts;

  while (std::getline(stream, line)) {
    if (line.empty() || line[0] == '#')
      continue;

    std::istringstream iss(line);
    std::string key;
    iss >> key;

    if (key == "VERSION") {
      iss >> header.version;
    } else if (key == "FIELDS") {
      std::string field;
      while (iss >> field) {
        fieldNames.push_back(field);
      }
    } else if (key == "SIZE") {
      int s;
      while (iss >> s) {
        sizes.push_back(s);
      }
    } else if (key == "TYPE") {
      char t;
      while (iss >> t) {
        types.push_back(t);
      }
    } else if (key == "COUNT") {
      int c;
      while (iss >> c) {
        counts.push_back(c);
      }
    } else if (key == "WIDTH") {
      iss >> header.width;
    } else if (key == "HEIGHT") {
      iss >> header.height;
    } else if (key == "VIEWPOINT") {
      std::getline(iss, header.viewpoint);
      if (!header.viewpoint.empty() && header.viewpoint[0] == ' ') {
        header.viewpoint = header.viewpoint.substr(1);
      }
    } else if (key == "POINTS") {
      iss >> header.points;
    } else if (key == "DATA") {
      iss >> header.dataType;
      break;
    }
  }

  // Build field info
  for (size_t i = 0; i < fieldNames.size(); i++) {
    FieldInfo fi;
    fi.name = fieldNames[i];
    fi.size = i < sizes.size() ? sizes[i] : 4;
    fi.type = i < types.size() ? types[i] : 'F';
    fi.count = i < counts.size() ? counts[i] : 1;
    header.fields.push_back(fi);
  }

  return header;
}

// Helper to push a parsed value into the correct variant vector
template <typename T> void pushValue(FieldData &data, T value) {
  if (auto *vec = std::get_if<std::vector<T>>(&data)) {
    vec->push_back(value);
  }
}

void PCDParser::parseAsciiData(std::istream &stream, PCDData &data) {
  const auto &header = data.header;

  // Initialize field data vectors
  data.fieldData.clear();
  for (const auto &field : header.fields) {
    FieldData fd = field.createStorage();
    // Reserve space
    std::visit([&header](auto &vec) { vec.reserve(header.points); }, fd);
    data.fieldData.push_back(std::move(fd));
  }

  std::string line;
  while (std::getline(stream, line)) {
    if (line.empty())
      continue;

    std::istringstream iss(line);
    std::string token;

    for (size_t i = 0; i < header.fields.size(); i++) {
      if (!(iss >> token))
        break;

      const auto &field = header.fields[i];
      auto &fd = data.fieldData[i];

      try {
        switch (field.type) {
        case 'I':
          switch (field.size) {
          case 1:
            pushValue(fd, static_cast<int8_t>(std::stoi(token)));
            break;
          case 2:
            pushValue(fd, static_cast<int16_t>(std::stoi(token)));
            break;
          case 4:
            pushValue(fd, static_cast<int32_t>(std::stol(token)));
            break;
          }
          break;
        case 'U':
          switch (field.size) {
          case 1:
            pushValue(fd, static_cast<uint8_t>(std::stoul(token)));
            break;
          case 2:
            pushValue(fd, static_cast<uint16_t>(std::stoul(token)));
            break;
          case 4:
            pushValue(fd, static_cast<uint32_t>(std::stoul(token)));
            break;
          }
          break;
        case 'F':
          if (field.size == 4)
            pushValue(fd, std::stof(token));
          else if (field.size == 8)
            pushValue(fd, std::stod(token));
          break;
        }
      } catch (...) {
        // Push default value on parse error
        std::visit(
            [](auto &vec) {
              using T = typename std::decay_t<decltype(vec)>::value_type;
              vec.push_back(T{});
            },
            fd);
      }
    }
  }
}

void PCDParser::parseBinaryData(std::istream &stream, PCDData &data) {
  const auto &header = data.header;

  // Initialize field data vectors
  data.fieldData.clear();
  for (const auto &field : header.fields) {
    FieldData fd = field.createStorage();
    std::visit([&header](auto &vec) { vec.reserve(header.points); }, fd);
    data.fieldData.push_back(std::move(fd));
  }

  int pointSize = header.getPointSize();
  std::vector<char> buffer(pointSize);

  for (int pt = 0; pt < header.points; pt++) {
    stream.read(buffer.data(), pointSize);
    if (!stream)
      break;

    int offset = 0;
    for (size_t i = 0; i < header.fields.size(); i++) {
      const auto &field = header.fields[i];
      auto &fd = data.fieldData[i];

      switch (field.type) {
      case 'I':
        switch (field.size) {
        case 1: {
          int8_t v;
          std::memcpy(&v, buffer.data() + offset, 1);
          pushValue(fd, v);
          break;
        }
        case 2: {
          int16_t v;
          std::memcpy(&v, buffer.data() + offset, 2);
          pushValue(fd, v);
          break;
        }
        case 4: {
          int32_t v;
          std::memcpy(&v, buffer.data() + offset, 4);
          pushValue(fd, v);
          break;
        }
        }
        break;
      case 'U':
        switch (field.size) {
        case 1: {
          uint8_t v;
          std::memcpy(&v, buffer.data() + offset, 1);
          pushValue(fd, v);
          break;
        }
        case 2: {
          uint16_t v;
          std::memcpy(&v, buffer.data() + offset, 2);
          pushValue(fd, v);
          break;
        }
        case 4: {
          uint32_t v;
          std::memcpy(&v, buffer.data() + offset, 4);
          pushValue(fd, v);
          break;
        }
        }
        break;
      case 'F':
        if (field.size == 4) {
          float v;
          std::memcpy(&v, buffer.data() + offset, 4);
          pushValue(fd, v);
        } else if (field.size == 8) {
          double v;
          std::memcpy(&v, buffer.data() + offset, 8);
          pushValue(fd, v);
        }
        break;
      }

      offset += field.size * field.count;
    }
  }
}

void PCDParser::parseBinaryCompressedData(std::istream &stream, PCDData &data) {
  const auto &header = data.header;

  // Read compressed and uncompressed sizes
  uint32_t compressedSize, uncompressedSize;
  stream.read(reinterpret_cast<char *>(&compressedSize), sizeof(uint32_t));
  stream.read(reinterpret_cast<char *>(&uncompressedSize), sizeof(uint32_t));

  if (!stream) {
    throw std::runtime_error("Failed to read compressed data sizes");
  }

  // Read compressed data
  std::vector<uint8_t> compressedData(compressedSize);
  stream.read(reinterpret_cast<char *>(compressedData.data()), compressedSize);

  if (!stream) {
    throw std::runtime_error("Failed to read compressed data");
  }

  // Decompress
  std::vector<uint8_t> decompressedData(uncompressedSize);
  size_t actualSize = lzfDecompress(compressedData.data(), compressedSize,
                                    decompressedData.data(), uncompressedSize);

  if (actualSize == 0 || actualSize != uncompressedSize) {
    throw std::runtime_error("LZF decompression failed");
  }

  // Initialize field data vectors
  data.fieldData.clear();
  for (const auto &field : header.fields) {
    FieldData fd = field.createStorage();
    std::visit([&header](auto &vec) { vec.reserve(header.points); }, fd);
    data.fieldData.push_back(std::move(fd));
  }

  // Parse decompressed data - PCL stores fields contiguously (all x, then all
  // y, etc.)

  // Calculate field offsets in the contiguous layout
  std::vector<size_t> fieldOffsets;
  size_t offset = 0;
  for (const auto &field : header.fields) {
    fieldOffsets.push_back(offset);
    offset += static_cast<size_t>(field.size) * field.count * header.points;
  }

  // Parse each field
  for (size_t f = 0; f < header.fields.size(); f++) {
    const auto &field = header.fields[f];
    auto &fd = data.fieldData[f];
    const uint8_t *fieldData = decompressedData.data() + fieldOffsets[f];

    for (int pt = 0; pt < header.points; pt++) {
      int fieldOffset = pt * field.size * field.count;

      switch (field.type) {
      case 'I':
        switch (field.size) {
        case 1: {
          int8_t v;
          std::memcpy(&v, fieldData + fieldOffset, 1);
          pushValue(fd, v);
          break;
        }
        case 2: {
          int16_t v;
          std::memcpy(&v, fieldData + fieldOffset, 2);
          pushValue(fd, v);
          break;
        }
        case 4: {
          int32_t v;
          std::memcpy(&v, fieldData + fieldOffset, 4);
          pushValue(fd, v);
          break;
        }
        }
        break;
      case 'U':
        switch (field.size) {
        case 1: {
          uint8_t v;
          std::memcpy(&v, fieldData + fieldOffset, 1);
          pushValue(fd, v);
          break;
        }
        case 2: {
          uint16_t v;
          std::memcpy(&v, fieldData + fieldOffset, 2);
          pushValue(fd, v);
          break;
        }
        case 4: {
          uint32_t v;
          std::memcpy(&v, fieldData + fieldOffset, 4);
          pushValue(fd, v);
          break;
        }
        }
        break;
      case 'F':
        if (field.size == 4) {
          float v;
          std::memcpy(&v, fieldData + fieldOffset, 4);
          pushValue(fd, v);
        } else if (field.size == 8) {
          double v;
          std::memcpy(&v, fieldData + fieldOffset, 8);
          pushValue(fd, v);
        }
        break;
      }
    }
  }
}

PCDData PCDParser::parse(const std::string &filepath) {
  std::ifstream file(filepath, std::ios::binary);
  if (!file.is_open()) {
    throw std::runtime_error("Failed to open file: " + filepath);
  }

  PCDData data;
  data.header = parseHeader(file);

  if (data.header.dataType == "ascii") {
    parseAsciiData(file, data);
  } else if (data.header.dataType == "binary") {
    parseBinaryData(file, data);
  } else if (data.header.dataType == "binary_compressed") {
    parseBinaryCompressedData(file, data);
  } else {
    throw std::runtime_error("Unknown data format: " + data.header.dataType);
  }

  return data;
}

void PCDParser::writeAscii(std::ostream &stream, const PCDData &data) {
  size_t numPoints = data.numPoints();

  for (size_t pt = 0; pt < numPoints; pt++) {
    for (size_t f = 0; f < data.fieldData.size(); f++) {
      if (f > 0)
        stream << " ";

      std::visit(
          [&stream, pt](const auto &vec) {
            if (pt < vec.size()) {
              using T = typename std::decay_t<decltype(vec)>::value_type;
              if constexpr (std::is_floating_point_v<T>) {
                // Use precision 9 for float (IEEE 754 guarantees 9 significant
                // digits for round-trip) and defaultfloat to use scientific
                // notation when needed (e.g., for packed RGB values
                // like 6.17e-39)
                stream << std::defaultfloat << std::setprecision(9) << vec[pt];
              } else {
                stream << static_cast<int64_t>(vec[pt]);
              }
            }
          },
          data.fieldData[f]);
    }
    stream << "\n";
  }
}

void PCDParser::writeBinary(std::ostream &stream, const PCDData &data) {
  size_t numPoints = data.numPoints();

  for (size_t pt = 0; pt < numPoints; pt++) {
    for (size_t f = 0; f < data.fieldData.size(); f++) {
      std::visit(
          [&stream, pt](const auto &vec) {
            if (pt < vec.size()) {
              stream.write(reinterpret_cast<const char *>(&vec[pt]),
                           sizeof(vec[pt]));
            }
          },
          data.fieldData[f]);
    }
  }
}

void PCDParser::writeBinaryCompressed(std::ostream &stream,
                                      const PCDData &data) {
  size_t numPoints = data.numPoints();
  const auto &header = data.header;

  // Build contiguous field buffers (PCL stores all x, then all y, etc.)
  std::vector<std::vector<uint8_t>> fieldBuffers;
  size_t totalSize = 0;

  for (size_t f = 0; f < data.fieldData.size(); f++) {
    std::vector<uint8_t> buffer;
    std::visit(
        [&buffer, numPoints](const auto &vec) {
          using T = typename std::decay_t<decltype(vec)>::value_type;
          size_t fieldSize = sizeof(T) * numPoints;
          buffer.resize(fieldSize);
          for (size_t pt = 0; pt < numPoints && pt < vec.size(); pt++) {
            std::memcpy(&buffer[pt * sizeof(T)], &vec[pt], sizeof(T));
          }
        },
        data.fieldData[f]);
    totalSize += buffer.size();
    fieldBuffers.push_back(std::move(buffer));
  }

  // Concatenate all field buffers
  std::vector<uint8_t> uncompressed(totalSize);
  size_t offset = 0;
  for (const auto &buf : fieldBuffers) {
    std::memcpy(&uncompressed[offset], buf.data(), buf.size());
    offset += buf.size();
  }

  // Compress with LZF
  std::vector<uint8_t> compressed(totalSize + totalSize / 8 + 16);
  size_t compressedSize = lzfCompress(uncompressed.data(), totalSize,
                                      compressed.data(), compressed.size());

  if (compressedSize == 0) {
    throw std::runtime_error("LZF compression failed");
  }

  // Write compressed and uncompressed sizes
  uint32_t compSize = static_cast<uint32_t>(compressedSize);
  uint32_t uncompSize = static_cast<uint32_t>(totalSize);
  stream.write(reinterpret_cast<const char *>(&compSize), sizeof(compSize));
  stream.write(reinterpret_cast<const char *>(&uncompSize), sizeof(uncompSize));

  // Write compressed data
  stream.write(reinterpret_cast<const char *>(compressed.data()),
               compressedSize);
}

void PCDParser::write(const std::string &filepath, const PCDData &data,
                      bool binary) {
  // Default: binary -> binary, !binary -> ascii
  write(filepath, data, binary ? "binary" : "ascii");
}

// Helper: Unpack packed RGB float field to separate r, g, b uint8 fields for
// ASCII output
static PCDData unpackRGBForAscii(const PCDData &input) {
  // Find packed rgb field (float field named "rgb")
  int rgbIdx = -1;
  for (size_t i = 0; i < input.header.fields.size(); i++) {
    const auto &f = input.header.fields[i];
    std::string nameLower = f.name;
    std::transform(nameLower.begin(), nameLower.end(), nameLower.begin(),
                   ::tolower);
    if (nameLower == "rgb" && f.type == 'F' && f.size == 4) {
      rgbIdx = static_cast<int>(i);
      break;
    }
  }

  if (rgbIdx < 0) {
    return input; // No packed RGB, return as-is
  }

  // Get the packed RGB data as floats
  const auto *rgbFloats =
      std::get_if<std::vector<float>>(&input.fieldData[rgbIdx]);
  if (!rgbFloats) {
    return input;
  }

  size_t numPoints = rgbFloats->size();

  // Create unpacked r, g, b vectors
  std::vector<uint8_t> rData(numPoints);
  std::vector<uint8_t> gData(numPoints);
  std::vector<uint8_t> bData(numPoints);

  for (size_t i = 0; i < numPoints; i++) {
    float packedFloat = (*rgbFloats)[i];

    // Reinterpret float bits as uint32
    uint32_t rgb;
    std::memcpy(&rgb, &packedFloat, sizeof(float));

    // Extract R, G, B bytes (PCL format: 0x00RRGGBB)
    rData[i] = (rgb >> 16) & 0xFF;
    gData[i] = (rgb >> 8) & 0xFF;
    bData[i] = rgb & 0xFF;
  }

  // Build new PCDData with separate r, g, b fields
  PCDData output;
  output.header = input.header;
  output.header.fields.clear();
  output.fieldData.clear();

  for (size_t i = 0; i < input.header.fields.size(); i++) {
    if (static_cast<int>(i) == rgbIdx) {
      // Replace rgb with r, g, b
      output.header.addField("r", 1, 'U', 1);
      output.header.addField("g", 1, 'U', 1);
      output.header.addField("b", 1, 'U', 1);
      output.fieldData.push_back(std::move(rData));
      output.fieldData.push_back(std::move(gData));
      output.fieldData.push_back(std::move(bData));
    } else {
      output.header.fields.push_back(input.header.fields[i]);
      output.fieldData.push_back(input.fieldData[i]);
    }
  }

  return output;
}

// Helper: Pack separate r, g, b uint8 fields back to packed RGB float for
// binary output
static PCDData packRGBForBinary(const PCDData &input) {
  // Find separate r, g, b uint8 fields
  int rIdx = -1, gIdx = -1, bIdx = -1;
  for (size_t i = 0; i < input.header.fields.size(); i++) {
    const auto &f = input.header.fields[i];
    std::string nameLower = f.name;
    std::transform(nameLower.begin(), nameLower.end(), nameLower.begin(),
                   ::tolower);
    if (nameLower == "r" && f.type == 'U' && f.size == 1)
      rIdx = static_cast<int>(i);
    if (nameLower == "g" && f.type == 'U' && f.size == 1)
      gIdx = static_cast<int>(i);
    if (nameLower == "b" && f.type == 'U' && f.size == 1)
      bIdx = static_cast<int>(i);
  }

  if (rIdx < 0 || gIdx < 0 || bIdx < 0) {
    return input; // No separate RGB, return as-is
  }

  // Get r, g, b data
  const auto *rVec = std::get_if<std::vector<uint8_t>>(&input.fieldData[rIdx]);
  const auto *gVec = std::get_if<std::vector<uint8_t>>(&input.fieldData[gIdx]);
  const auto *bVec = std::get_if<std::vector<uint8_t>>(&input.fieldData[bIdx]);

  if (!rVec || !gVec || !bVec) {
    return input;
  }

  size_t numPoints = rVec->size();

  // Create packed RGB float vector
  std::vector<float> rgbFloats(numPoints);
  for (size_t i = 0; i < numPoints; i++) {
    uint32_t packed = (static_cast<uint32_t>((*rVec)[i]) << 16) |
                      (static_cast<uint32_t>((*gVec)[i]) << 8) |
                      static_cast<uint32_t>((*bVec)[i]);
    std::memcpy(&rgbFloats[i], &packed, sizeof(float));
  }

  // Build new PCDData with packed rgb field
  PCDData output;
  output.header = input.header;
  output.header.fields.clear();
  output.fieldData.clear();

  bool rgbAdded = false;
  for (size_t i = 0; i < input.header.fields.size(); i++) {
    int idx = static_cast<int>(i);
    if (idx == rIdx) {
      // Add packed rgb in place of r
      output.header.addField("rgb", 4, 'F', 1);
      output.fieldData.push_back(rgbFloats);
      rgbAdded = true;
    } else if (idx == gIdx || idx == bIdx) {
      // Skip g and b (already merged into rgb)
      continue;
    } else {
      output.header.fields.push_back(input.header.fields[i]);
      output.fieldData.push_back(input.fieldData[i]);
    }
  }

  return output;
}

void PCDParser::write(const std::string &filepath, const PCDData &data,
                      const std::string &format) {
  bool isBinary = (format == "binary" || format == "binary_compressed");

  // Transform data for format compatibility
  PCDData outputData;
  if (!isBinary) {
    // ASCII: unpack rgb to separate r, g, b for readability
    outputData = unpackRGBForAscii(data);
  } else {
    // Binary: pack separate r, g, b back to rgb for efficiency
    outputData = packRGBForBinary(data);
  }

  std::ofstream file(filepath, isBinary ? std::ios::binary : std::ios::out);
  if (!file.is_open()) {
    throw std::runtime_error("Failed to open file for writing: " + filepath);
  }

  // Write header
  file << "# .PCD v0.7 - Point Cloud Data file format\n";
  file << "VERSION " << outputData.header.version << "\n";

  file << "FIELDS";
  for (const auto &f : outputData.header.fields) {
    file << " " << f.name;
  }
  file << "\n";

  file << "SIZE";
  for (const auto &f : outputData.header.fields) {
    file << " " << f.size;
  }
  file << "\n";

  file << "TYPE";
  for (const auto &f : outputData.header.fields) {
    file << " " << f.type;
  }
  file << "\n";

  file << "COUNT";
  for (const auto &f : outputData.header.fields) {
    file << " " << f.count;
  }
  file << "\n";

  file << "WIDTH " << outputData.numPoints() << "\n";
  file << "HEIGHT 1\n";
  file << "VIEWPOINT " << outputData.header.viewpoint << "\n";
  file << "POINTS " << outputData.numPoints() << "\n";
  file << "DATA " << format << "\n";

  if (format == "binary_compressed") {
    writeBinaryCompressed(file, outputData);
  } else if (format == "binary") {
    writeBinary(file, outputData);
  } else {
    writeAscii(file, outputData);
  }
}

void PCDParser::updateLabels(
    const std::string &filepath, const std::vector<uint32_t> &labels,
    bool /* binary - deprecated, format is auto-detected */) {
  updateLabelsWithFormat(filepath, labels, "");
}

void PCDParser::updateLabelsWithFormat(const std::string &filepath,
                                       const std::vector<uint32_t> &labels,
                                       const std::string &format) {
  PCDData data = parse(filepath);
  data.setLabels(labels);

  std::string outputFormat = format;
  if (outputFormat.empty()) {
    // Preserve original format
    outputFormat = data.header.dataType;
  }

  write(filepath, data, outputFormat);
}

void PCDParser::convertFormat(const std::string &filepath,
                              const std::string &format) {
  PCDData data = parse(filepath);
  write(filepath, data, format);
}

void PCDParser::convertFormat(const std::string &filepath, bool toBinary) {
  convertFormat(filepath, toBinary ? "binary" : "ascii");
}

} // namespace pcd

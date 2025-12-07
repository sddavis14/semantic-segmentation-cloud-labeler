#include "pcd_parser.h"
#include <iomanip>
#include <iostream>

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
    throw std::runtime_error("binary_compressed format not yet supported");
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
                stream << std::fixed << std::setprecision(6) << vec[pt];
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

void PCDParser::write(const std::string &filepath, const PCDData &data,
                      bool binary) {
  std::ofstream file(filepath, binary ? std::ios::binary : std::ios::out);
  if (!file.is_open()) {
    throw std::runtime_error("Failed to open file for writing: " + filepath);
  }

  // Write header
  file << "# .PCD v0.7 - Point Cloud Data file format\n";
  file << "VERSION " << data.header.version << "\n";

  file << "FIELDS";
  for (const auto &f : data.header.fields) {
    file << " " << f.name;
  }
  file << "\n";

  file << "SIZE";
  for (const auto &f : data.header.fields) {
    file << " " << f.size;
  }
  file << "\n";

  file << "TYPE";
  for (const auto &f : data.header.fields) {
    file << " " << f.type;
  }
  file << "\n";

  file << "COUNT";
  for (const auto &f : data.header.fields) {
    file << " " << f.count;
  }
  file << "\n";

  file << "WIDTH " << data.numPoints() << "\n";
  file << "HEIGHT 1\n";
  file << "VIEWPOINT " << data.header.viewpoint << "\n";
  file << "POINTS " << data.numPoints() << "\n";
  file << "DATA " << (binary ? "binary" : "ascii") << "\n";

  if (binary) {
    writeBinary(file, data);
  } else {
    writeAscii(file, data);
  }
}

void PCDParser::updateLabels(
    const std::string &filepath, const std::vector<uint32_t> &labels,
    bool /* binary - deprecated, format is auto-detected */) {
  PCDData data = parse(filepath);
  // Preserve the original format
  bool originalIsBinary = (data.header.dataType == "binary");
  data.setLabels(labels);
  write(filepath, data, originalIsBinary);
}

void PCDParser::convertFormat(const std::string &filepath, bool toBinary) {
  PCDData data = parse(filepath);
  write(filepath, data, toBinary);
}

} // namespace pcd

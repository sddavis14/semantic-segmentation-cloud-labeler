#include "pcd_parser/pcd_parser.h"
#include <napi.h>

// Parse a PCD file and return JavaScript object
Napi::Value ParsePCD(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "String filepath expected")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string filepath = info[0].As<Napi::String>().Utf8Value();

  try {
    pcd::PCDData data = pcd::PCDParser::parse(filepath);

    // Create result object
    Napi::Object result = Napi::Object::New(env);

    // Header info
    Napi::Object header = Napi::Object::New(env);
    header.Set("version", data.header.version);
    header.Set("width", data.header.width);
    header.Set("height", data.header.height);
    header.Set("points", static_cast<int>(data.numPoints()));
    header.Set("dataType", data.header.dataType);

    // Field names, types, and sizes
    Napi::Array fieldNames = Napi::Array::New(env, data.header.fields.size());
    Napi::Array fieldTypes = Napi::Array::New(env, data.header.fields.size());
    Napi::Array fieldSizes = Napi::Array::New(env, data.header.fields.size());
    for (size_t i = 0; i < data.header.fields.size(); i++) {
      fieldNames[i] = Napi::String::New(env, data.header.fields[i].name);
      fieldTypes[i] = Napi::String::New(env, std::string(1, data.header.fields[i].type));
      fieldSizes[i] = Napi::Number::New(env, data.header.fields[i].size);
    }
    header.Set("fields", fieldNames);
    header.Set("fieldTypes", fieldTypes);
    header.Set("fieldSizes", fieldSizes);
    result.Set("header", header);

    // Positions as Float32Array (interleaved x,y,z)
    auto positions = data.getPositions();
    Napi::Float32Array posArr = Napi::Float32Array::New(env, positions.size());
    for (size_t i = 0; i < positions.size(); i++) {
      posArr[i] = positions[i];
    }
    result.Set("positions", posArr);

    // Labels as Uint32Array
    auto labels = data.getLabels();
    Napi::Uint32Array labelsArr = Napi::Uint32Array::New(env, labels.size());
    for (size_t i = 0; i < labels.size(); i++) {
      labelsArr[i] = labels[i];
    }
    result.Set("labels", labelsArr);

    // All fields as named Float32Arrays (for colorization)
    Napi::Object fields = Napi::Object::New(env);
    for (size_t i = 0; i < data.header.fields.size(); i++) {
      const std::string &name = data.header.fields[i].name;
      auto fieldData = data.getFieldAsFloat(static_cast<int>(i));
      Napi::Float32Array arr = Napi::Float32Array::New(env, fieldData.size());
      for (size_t j = 0; j < fieldData.size(); j++) {
        arr[j] = fieldData[j];
      }
      fields.Set(name, arr);
    }
    result.Set("fields", fields);

    // RGB colors as Float32Array (interleaved r,g,b) - pre-processed from all formats
    result.Set("hasRGB", Napi::Boolean::New(env, data.hasRGB()));
    if (data.hasRGB()) {
      auto rgb = data.getRGB();
      Napi::Float32Array rgbArr = Napi::Float32Array::New(env, rgb.size());
      for (size_t i = 0; i < rgb.size(); i++) {
        rgbArr[i] = rgb[i];
      }
      result.Set("rgb", rgbArr);
    }

    return result;

  } catch (const std::exception &e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Null();
  }
}

// Update labels in an existing PCD file
Napi::Value UpdateLabels(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2) {
    Napi::TypeError::New(env, "Expected filepath and labels")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string filepath = info[0].As<Napi::String>().Utf8Value();
  Napi::Uint32Array labelsArr = info[1].As<Napi::Uint32Array>();
  bool binary = info.Length() > 2 && info[2].IsBoolean() &&
                info[2].As<Napi::Boolean>().Value();

  try {
    std::vector<uint32_t> labels(labelsArr.ElementLength());
    for (size_t i = 0; i < labels.size(); i++) {
      labels[i] = labelsArr[i];
    }

    pcd::PCDParser::updateLabels(filepath, labels, binary);

    return Napi::Boolean::New(env, true);

  } catch (const std::exception &e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Null();
  }
}

// Update labels in an existing PCD file with format string
Napi::Value UpdateLabelsWithFormat(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (info.Length() < 3) {
    Napi::TypeError::New(env, "Expected filepath, labels, and format")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string filepath = info[0].As<Napi::String>().Utf8Value();
  Napi::Uint32Array labelsArr = info[1].As<Napi::Uint32Array>();
  std::string format = info[2].As<Napi::String>().Utf8Value();

  try {
    std::vector<uint32_t> labels(labelsArr.ElementLength());
    for (size_t i = 0; i < labels.size(); i++) {
      labels[i] = labelsArr[i];
    }

    pcd::PCDParser::updateLabelsWithFormat(filepath, labels, format);

    return Napi::Boolean::New(env, true);

  } catch (const std::exception &e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Null();
  }
}

// Write a complete PCD file
Napi::Value WritePCD(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (info.Length() < 3) {
    Napi::TypeError::New(env, "Expected filepath, positions, and labels")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string filepath = info[0].As<Napi::String>().Utf8Value();
  Napi::Float32Array positions = info[1].As<Napi::Float32Array>();
  Napi::Uint32Array labelsArr = info[2].As<Napi::Uint32Array>();
  bool binary = info.Length() > 3 && info[3].IsBoolean() &&
                info[3].As<Napi::Boolean>().Value();

  try {
    size_t numPoints = positions.ElementLength() / 3;

    pcd::PCDData data;
    data.header.addField("x", 4, 'F', 1);
    data.header.addField("y", 4, 'F', 1);
    data.header.addField("z", 4, 'F', 1);
    data.header.addField("label", 4, 'U', 1);

    // Create field data
    std::vector<float> x(numPoints), y(numPoints), z(numPoints);
    std::vector<uint32_t> labels(numPoints);

    for (size_t i = 0; i < numPoints; i++) {
      x[i] = positions[i * 3];
      y[i] = positions[i * 3 + 1];
      z[i] = positions[i * 3 + 2];
      labels[i] = i < labelsArr.ElementLength() ? labelsArr[i] : 0;
    }

    data.fieldData.push_back(std::move(x));
    data.fieldData.push_back(std::move(y));
    data.fieldData.push_back(std::move(z));
    data.fieldData.push_back(std::move(labels));

    pcd::PCDParser::write(filepath, data, binary);

    return Napi::Boolean::New(env, true);

  } catch (const std::exception &e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Null();
  }
}

// Convert PCD format (ASCII <-> binary)
Napi::Value ConvertFormat(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2) {
    Napi::TypeError::New(env, "Expected filepath and toBinary flag")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string filepath = info[0].As<Napi::String>().Utf8Value();
  bool toBinary = info[1].As<Napi::Boolean>().Value();

  try {
    pcd::PCDParser::convertFormat(filepath, toBinary);
    return Napi::Boolean::New(env, true);
  } catch (const std::exception &e) {
    Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
    return env.Null();
  }
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("parse", Napi::Function::New(env, ParsePCD));
  exports.Set("write", Napi::Function::New(env, WritePCD));
  exports.Set("updateLabels", Napi::Function::New(env, UpdateLabels));
  exports.Set("updateLabelsWithFormat",
              Napi::Function::New(env, UpdateLabelsWithFormat));
  exports.Set("convertFormat", Napi::Function::New(env, ConvertFormat));
  return exports;
}

NODE_API_MODULE(pcd_parser, Init)

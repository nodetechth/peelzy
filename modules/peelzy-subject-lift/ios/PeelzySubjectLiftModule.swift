import ExpoModulesCore
import CoreImage
import UIKit
import Vision

public class PeelzySubjectLiftModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PeelzySubjectLift")

    AsyncFunction("liftSubjectAsync") { (imageUri: String) async throws -> [String: Any] in
      guard #available(iOS 17.0, *) else {
        throw SubjectLiftError.unsupportedOS
      }

      let startTime = Date()
      let image = try loadImage(from: imageUri).normalizedUp()
      let lifted = try renderStickerSubject(from: image)
      let alphaAnalysis = analyzeAlpha(for: lifted.image)
      let elapsedMs = Int(Date().timeIntervalSince(startTime) * 1000)

      guard let pngData = lifted.image.pngData() else {
        throw SubjectLiftError.pngEncodingFailed
      }

      let outputURL = FileManager.default.temporaryDirectory
        .appendingPathComponent("peelzy-subject-lift-\(UUID().uuidString).png")
      try pngData.write(to: outputURL, options: [.atomic])

      return [
        "uri": outputURL.absoluteString,
        "subjectCount": lifted.subjectCount,
        "width": lifted.image.size.width,
        "height": lifted.image.size.height,
        "elapsedMs": elapsedMs,
        "contentBounds": alphaAnalysis.bounds,
        "alphaMask": alphaAnalysis.maskHex
      ]
    }
  }
}

@available(iOS 17.0, *)
private func renderStickerSubject(from image: UIImage) throws -> (image: UIImage, subjectCount: Int) {
  guard let cgImage = image.cgImage else {
    throw SubjectLiftError.imageRenderFailed
  }

  let request = VNGenerateForegroundInstanceMaskRequest()
  let handler = VNImageRequestHandler(cgImage: cgImage, orientation: .up, options: [:])
  try handler.perform([request])

  guard let observation = request.results?.first else {
    throw SubjectLiftError.noSubjectsFound
  }

  let instances = observation.allInstances
  guard !instances.isEmpty else {
    throw SubjectLiftError.noSubjectsFound
  }

  let scaledMask = try observation.generateScaledMaskForImage(
    forInstances: instances,
    from: handler
  )
  let inputImage = CIImage(cgImage: cgImage)
  let originalExtent = inputImage.extent

  let longestEdge = max(originalExtent.width, originalExtent.height)
  let shapeRadius = max(5, longestEdge * 0.0084)
  let featherRadius = max(2, shapeRadius * 0.14)
  let borderRadius = max(8, longestEdge * 0.0243)
  let canvasPadding = ceil(shapeRadius + featherRadius + borderRadius + 2)
  let imageExtent = CGRect(
    x: 0,
    y: 0,
    width: originalExtent.width + canvasPadding * 2,
    height: originalExtent.height + canvasPadding * 2
  )
  let extendedInputImage = inputImage
    .clampedToExtent()
    .transformed(by: CGAffineTransform(translationX: canvasPadding, y: canvasPadding))
    .cropped(to: imageExtent)
  let foregroundMask = CIImage(cvPixelBuffer: scaledMask)
    .transformed(by: CGAffineTransform(translationX: canvasPadding, y: canvasPadding))
    .cropped(to: imageExtent)
  let correctedForegroundMask = foregroundMask
  let shapeMask = correctedForegroundMask
    .applyingFilter("CIMorphologyMaximum", parameters: [kCIInputRadiusKey: shapeRadius])
    .cropped(to: imageExtent)
    .applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: featherRadius])
    .cropped(to: imageExtent)
  let outlineMask = shapeMask
    .applyingFilter("CIMorphologyMaximum", parameters: [kCIInputRadiusKey: borderRadius])
    .cropped(to: imageExtent)

  let transparent = CIImage(color: .clear).cropped(to: imageExtent)
  let white = CIImage(color: CIColor.white).cropped(to: imageExtent)
  let outline = white.applyingFilter(
    "CIBlendWithMask",
    parameters: [
      kCIInputBackgroundImageKey: transparent,
      kCIInputMaskImageKey: outlineMask,
    ]
  ).cropped(to: imageExtent)
  let stickerImage = extendedInputImage.applyingFilter(
    "CIBlendWithMask",
    parameters: [
      kCIInputBackgroundImageKey: transparent,
      kCIInputMaskImageKey: shapeMask,
    ]
  )
    .cropped(to: imageExtent)
    .composited(over: outline)
    .cropped(to: imageExtent)

  let context = CIContext(options: [.useSoftwareRenderer: false])
  guard let outputCGImage = context.createCGImage(stickerImage, from: imageExtent) else {
    throw SubjectLiftError.imageRenderFailed
  }

  return (
    UIImage(cgImage: outputCGImage, scale: image.scale, orientation: .up),
    instances.count
  )
}

private struct AlphaAnalysis {
  let bounds: [String: Double]
  let maskHex: String
}

private let alphaMaskSize = 64

private func analyzeAlpha(for image: UIImage) -> AlphaAnalysis {
  guard let cgImage = image.cgImage else {
    return AlphaAnalysis(
      bounds: ["x": 0, "y": 0, "width": Double(image.size.width), "height": Double(image.size.height)],
      maskHex: fullAlphaMaskHex()
    )
  }

  let width = cgImage.width
  let height = cgImage.height
  let bytesPerPixel = 4
  let bytesPerRow = width * bytesPerPixel
  var pixels = [UInt8](repeating: 0, count: height * bytesPerRow)
  let colorSpace = CGColorSpaceCreateDeviceRGB()

  guard let context = CGContext(
    data: &pixels,
    width: width,
    height: height,
    bitsPerComponent: 8,
    bytesPerRow: bytesPerRow,
    space: colorSpace,
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
  ) else {
    return AlphaAnalysis(
      bounds: ["x": 0, "y": 0, "width": Double(width), "height": Double(height)],
      maskHex: fullAlphaMaskHex()
    )
  }

  context.translateBy(x: 0, y: CGFloat(height))
  context.scaleBy(x: 1, y: -1)
  context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))

  var minX = width
  var minY = height
  var maxX = -1
  var maxY = -1

  for y in 0..<height {
    for x in 0..<width {
      let alpha = pixels[y * bytesPerRow + x * bytesPerPixel + 3]
      if alpha > 8 {
        minX = min(minX, x)
        minY = min(minY, y)
        maxX = max(maxX, x)
        maxY = max(maxY, y)
      }
    }
  }

  var maskBytes = [UInt8](repeating: 0, count: (alphaMaskSize * alphaMaskSize + 7) / 8)
  for maskY in 0..<alphaMaskSize {
    let startY = maskY * height / alphaMaskSize
    let endY = max(startY + 1, (maskY + 1) * height / alphaMaskSize)

    for maskX in 0..<alphaMaskSize {
      let startX = maskX * width / alphaMaskSize
      let endX = max(startX + 1, (maskX + 1) * width / alphaMaskSize)
      var isOpaque = false

      for y in startY..<min(endY, height) {
        for x in startX..<min(endX, width) {
          if pixels[y * bytesPerRow + x * bytesPerPixel + 3] > 8 {
            isOpaque = true
            break
          }
        }
        if isOpaque { break }
      }

      if isOpaque {
        let index = maskY * alphaMaskSize + maskX
        maskBytes[index / 8] |= UInt8(1 << (7 - (index % 8)))
      }
    }
  }

  let bounds = maxX < minX || maxY < minY
    ? ["x": 0, "y": 0, "width": Double(width), "height": Double(height)]
    : [
      "x": Double(minX),
      "y": Double(minY),
      "width": Double(maxX - minX + 1),
      "height": Double(maxY - minY + 1)
    ]

  return AlphaAnalysis(
    bounds: bounds,
    maskHex: maskBytes.map { String(format: "%02x", $0) }.joined()
  )
}

private func fullAlphaMaskHex() -> String {
  return [UInt8](repeating: 255, count: (alphaMaskSize * alphaMaskSize + 7) / 8)
    .map { String(format: "%02x", $0) }
    .joined()
}

private func loadImage(from imageUri: String) throws -> UIImage {
  guard let url = URL(string: imageUri) else {
    throw SubjectLiftError.invalidImageUri
  }

  let path = url.isFileURL ? url.path : imageUri
  guard let image = UIImage(contentsOfFile: path) else {
    throw SubjectLiftError.imageLoadFailed
  }

  return image
}

private enum SubjectLiftError: Error, LocalizedError {
  case unsupportedOS
  case invalidImageUri
  case imageLoadFailed
  case noSubjectsFound
  case imageRenderFailed
  case pngEncodingFailed

  var errorDescription: String? {
    switch self {
    case .unsupportedOS:
      return "Apple Subject Lift requires iOS 17 or later."
    case .invalidImageUri:
      return "The selected image URI is invalid."
    case .imageLoadFailed:
      return "Could not load the selected image."
    case .noSubjectsFound:
      return "No liftable subject was found in this image."
    case .imageRenderFailed:
      return "Could not render the sticker shape."
    case .pngEncodingFailed:
      return "Could not encode the lifted subject as PNG."
    }
  }
}

private extension UIImage {
  func normalizedUp() -> UIImage {
    guard imageOrientation != .up else {
      return self
    }

    let format = UIGraphicsImageRendererFormat()
    format.scale = scale
    let renderer = UIGraphicsImageRenderer(size: size, format: format)

    return renderer.image { _ in
      draw(in: CGRect(origin: .zero, size: size))
    }
  }
}

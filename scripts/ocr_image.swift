import Foundation
import ImageIO
import Vision

if CommandLine.arguments.count < 2 {
  exit(2)
}

let imageURL = URL(fileURLWithPath: CommandLine.arguments[1])
guard
  let source = CGImageSourceCreateWithURL(imageURL as CFURL, nil),
  let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
else {
  exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
if #available(macOS 11.0, *) {
  request.recognitionLanguages = ["zh-Hans", "en-US"]
}

let handler = VNImageRequestHandler(cgImage: image, options: [:])
try handler.perform([request])

let lines = (request.results ?? [])
  .compactMap { $0.topCandidates(1).first?.string.trimmingCharacters(in: .whitespacesAndNewlines) }
  .filter { !$0.isEmpty }

print(lines.joined(separator: "\n"))

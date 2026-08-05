import Foundation
import Vision

/// Apple Vision–backed implementation of the shared verification interface
/// (src/native/verificationModule.ts). Not yet wired into the iOS native
/// module registry or Xcode project — that lands with the bridge
/// implementation task (M2). Stub for P0-4.0: signatures only.
///
/// No image or embedding buffer here may be logged, persisted, or
/// transmitted (CLAUDE.md rule 1). Callers must release/zeroise buffers in
/// a `defer` block.
final class VisionVerification {

    struct OcrResult {
        let dateOfBirth: String?
        let confidence: Double
    }

    struct FaceMatchResult {
        let similarity: Double
        let thresholdVersion: String
    }

    struct LivenessResult {
        let passed: Bool
    }

    func extractDateOfBirth(idImage: Data) async throws -> OcrResult {
        fatalError("not implemented — native ML bridge task")
    }

    func matchFaces(idImage: Data, selfieImage: Data) async throws -> FaceMatchResult {
        fatalError("not implemented — native ML bridge task")
    }

    func checkLiveness(selfieFrames: [Data]) async throws -> LivenessResult {
        fatalError("not implemented — native ML bridge task")
    }
}

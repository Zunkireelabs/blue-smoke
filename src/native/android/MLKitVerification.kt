package com.bluesmoke.app.native

/**
 * ML Kit–backed implementation of the shared verification interface
 * (src/native/verificationModule.ts). Not yet wired into the Android native
 * module registry or Gradle build — that lands with the bridge
 * implementation task (M2). Stub for P0-4.0: signatures only.
 *
 * No image or embedding buffer here may be logged, persisted, or
 * transmitted (CLAUDE.md rule 1). Callers must release/zero buffers in a
 * `finally` block.
 */
class MLKitVerification {

    data class OcrResult(val dateOfBirth: String?, val confidence: Double)

    data class FaceMatchResult(val similarity: Double, val thresholdVersion: String)

    data class LivenessResult(val passed: Boolean)

    suspend fun extractDateOfBirth(idImage: ByteArray): OcrResult {
        throw NotImplementedError("not implemented — native ML bridge task")
    }

    suspend fun matchFaces(idImage: ByteArray, selfieImage: ByteArray): FaceMatchResult {
        throw NotImplementedError("not implemented — native ML bridge task")
    }

    suspend fun checkLiveness(selfieFrames: List<ByteArray>): LivenessResult {
        throw NotImplementedError("not implemented — native ML bridge task")
    }
}

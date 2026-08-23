import Testing
@testable import h158lib

struct ReconnectPolicyTests {

    @Test func shouldRetry_allowsUpToMaxAttempts() {
        let policy = ReconnectPolicy(maxAttempts: 1)

        #expect(policy.shouldRetry())
        #expect(!policy.shouldRetry())
    }

    @Test func shouldRetry_zeroMaxAttemptsNeverRetries() {
        let policy = ReconnectPolicy(maxAttempts: 0)

        #expect(!policy.shouldRetry())
    }

    @Test func reset_restoresAttempts() {
        let policy = ReconnectPolicy(maxAttempts: 1)

        #expect(policy.shouldRetry())
        #expect(!policy.shouldRetry())
        policy.reset()
        #expect(policy.shouldRetry())
    }
}

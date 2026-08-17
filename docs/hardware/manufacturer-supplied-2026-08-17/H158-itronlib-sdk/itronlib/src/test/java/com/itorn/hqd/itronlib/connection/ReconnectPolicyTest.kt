package com.itorn.hqd.itronlib.connection

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReconnectPolicyTest {
    @Test
    fun shouldRetry_returnsTrueOnlyOnce() {
        val policy = ReconnectPolicy(maxAttempts = 1)

        assertTrue(policy.shouldRetry())
        assertFalse(policy.shouldRetry())
    }

    @Test
    fun reset_allowsOneRetryAgain() {
        val policy = ReconnectPolicy(maxAttempts = 1)

        policy.shouldRetry()
        policy.reset()

        assertTrue(policy.shouldRetry())
    }
}

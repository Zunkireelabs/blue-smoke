package com.itorn.hqd.itronlib

import android.app.Service
import android.content.Intent
import android.os.Binder
import android.os.IBinder

class ItronBleService : Service() {
    private val binder = LocalBinder()

    override fun onBind(intent: Intent): IBinder = binder

    class LocalBinder : Binder()
}

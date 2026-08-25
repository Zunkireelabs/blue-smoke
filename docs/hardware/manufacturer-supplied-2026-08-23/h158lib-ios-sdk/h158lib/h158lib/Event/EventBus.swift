import Foundation

/// 线程安全的事件分发器。dispatch 在调用方线程同步执行，
/// 需要 UI 刷新的监听方自行切回主线程（对齐 Android EventBus + runOnUiThread 模式）。
public final class EventBus {
    public typealias Listener = (BleEvent) -> Void

    private var listeners: [VMPenEventType: [UUID: Listener]] = [:]
    private let lock = NSLock()

    public init() {}

    /// 注册监听，返回 token 用于移除（闭包无法判等）
    @discardableResult
    public func addEventListener(_ type: VMPenEventType, listener: @escaping Listener) -> UUID {
        let token = UUID()
        lock.lock()
        listeners[type, default: [:]][token] = listener
        lock.unlock()
        return token
    }

    public func removeEventListener(_ type: VMPenEventType, token: UUID) {
        lock.lock()
        listeners[type]?[token] = nil
        lock.unlock()
    }

    public func clear() {
        lock.lock()
        listeners.removeAll()
        lock.unlock()
    }

    public func dispatch(_ event: BleEvent) {
        lock.lock()
        let snapshot = listeners[event.type].map { Array($0.values) } ?? []
        lock.unlock()
        snapshot.forEach { $0(event) }
    }
}

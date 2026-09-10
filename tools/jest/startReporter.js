/* eslint-env node */
// TEMPORARY CI diagnostic — delete with the branch chore/ci-hang-diagnosis.
//
// Reporters run in Jest's PARENT process, so onTestStart fires the moment the parent hands a file
// to a worker. When the run wedges, the last START line names the file the worker never finished —
// which the default reporter cannot tell us, because it only prints on completion.
const t0 = Date.now();
const at = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(6);
const heap = () => Math.round(process.memoryUsage().heapUsed / 1048576);

module.exports = class StartReporter {
  onTestStart(test) {
    console.log(`[diag ${at()}s parentHeap=${heap()}MB] START ${test.path}`);
  }

  onTestResult(test, result) {
    const p = result.numPassingTests;
    const f = result.numFailingTests;
    console.log(`[diag ${at()}s parentHeap=${heap()}MB] DONE  ${test.path} (${p}p/${f}f)`);
  }
};

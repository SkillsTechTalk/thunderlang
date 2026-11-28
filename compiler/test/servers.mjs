// Shared by the tests that start a Thunder program answering requests (core-http, reference-app).

/** Stop a server: Ctrl+C, then a hard stop after 5 seconds; never waits for an exit that already happened. */
export function stopChild(child) {
  return new Promise((done) => {
    if (child.exitCode !== null || child.signalCode !== null) return done();
    const hard = setTimeout(() => { child.kill('SIGKILL'); }, 5000);
    child.once('exit', () => { clearTimeout(hard); done(); });
    child.kill('SIGINT');
  });
}

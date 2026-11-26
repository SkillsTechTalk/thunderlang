// A warm Java process for the conformance tests (compiler/test/java-conformance.mjs): it compiles each Thunder program's
// Java in this process (javax.tools) and runs it in a class loader of its own, so every program starts with a fresh
// runtime, without starting a new JVM for each of the hundreds of programs the Core tests run.
//
// Protocol, over stdin and stdout, every field written as "<byte length>\n<bytes>":
//   request:  file count, then (path, text) for each file; the class to run (app.Main or app.RunTests); the folder
//   response: status, stdout, stderr
// Status 70 means this server failed (a stack trace follows in stderr); 2 means javac rejected the generated Java.
import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.PrintStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import javax.tools.JavaCompiler;
import javax.tools.ToolProvider;

public final class ThunderJavaServer {
  static InputStream in = new BufferedInputStream(System.in);
  static OutputStream out = System.out;

  static byte[] field() throws IOException {
    StringBuilder n = new StringBuilder();
    for (;;) { int c = in.read(); if (c < 0) return null; if (c == '\n') break; n.append((char) c); }
    return in.readNBytes(Integer.parseInt(n.toString()));
  }
  static String text() throws IOException { byte[] b = field(); return b == null ? null : new String(b, StandardCharsets.UTF_8); }
  static void write(byte[] b) throws IOException { out.write((b.length + "\n").getBytes(StandardCharsets.US_ASCII)); out.write(b); }

  public static void main(String[] args) throws Exception {
    Path runtimeClasses = Paths.get(args[0]);
    Path work = Paths.get(args[1]);
    JavaCompiler javac = ToolProvider.getSystemJavaCompiler();
    System.setProperty("thunder.embedded", "true");
    int job = 0;
    for (;;) {
      String count = text();
      if (count == null) return;
      Path dir = work.resolve("job" + (job++));
      List<String> sources = new ArrayList<>();
      for (int i = Integer.parseInt(count); i > 0; i--) {
        Path p = dir.resolve(text());
        Files.createDirectories(p.getParent());
        Files.write(p, field());
        sources.add(p.toString());
      }
      String main = text(), cwd = text();
      int status; byte[] so = new byte[0], se = new byte[0];
      try {
        Path classes = dir.resolve("classes");
        Files.createDirectories(classes);
        List<String> opts = new ArrayList<>(List.of("--release", "17", "-encoding", "UTF-8", "-nowarn", "-cp", runtimeClasses.toString(), "-d", classes.toString()));
        opts.addAll(sources);
        ByteArrayOutputStream diag = new ByteArrayOutputStream();
        if (javac.run(null, diag, diag, opts.toArray(new String[0])) != 0) {
          status = 2; se = ("javac could not compile the generated Java:\n" + diag.toString(StandardCharsets.UTF_8)).getBytes(StandardCharsets.UTF_8);
        } else {
          System.setProperty("thunder.cwd", cwd);
          try (URLClassLoader loader = new URLClassLoader(new URL[] { classes.toUri().toURL(), runtimeClasses.toUri().toURL() }, ClassLoader.getPlatformClassLoader())) {
            Class<?> rt = loader.loadClass("thunder.ThunderRuntime");
            ByteArrayOutputStream ob = new ByteArrayOutputStream(), eb = new ByteArrayOutputStream();
            set(rt, "out", new PrintStream(ob, true, StandardCharsets.UTF_8));
            set(rt, "err", new PrintStream(eb, true, StandardCharsets.UTF_8));
            set(rt, "embedded", true);
            Method m = loader.loadClass(main).getMethod("main", String[].class);
            try { m.invoke(null, (Object) new String[0]); status = (Integer) rt.getMethod("takeExitCode").invoke(null); }
            catch (InvocationTargetException e) { status = 70; eb.write(trace(e.getCause()).getBytes(StandardCharsets.UTF_8)); }
            catch (ExceptionInInitializerError e) { status = 70; eb.write(trace(e).getBytes(StandardCharsets.UTF_8)); }
            so = ob.toByteArray(); se = eb.toByteArray();
          }
        }
      } catch (Throwable e) {
        status = 70; se = trace(e).getBytes(StandardCharsets.UTF_8);
      }
      write(String.valueOf(status).getBytes(StandardCharsets.US_ASCII));
      write(so);
      write(se);
      out.flush();
    }
  }

  static void set(Class<?> c, String name, Object v) throws ReflectiveOperationException { Field f = c.getField(name); f.set(null, v); }
  static String trace(Throwable e) { StringWriter w = new StringWriter(); e.printStackTrace(new PrintWriter(w)); return w.toString(); }
}

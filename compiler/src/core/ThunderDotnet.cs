// ThunderDotnet.cs: written by the Thunder compiler next to compiled C# when a program uses .NET libraries
// (Use "<Type>" from .NET as <name>, or from NuGet). The boundary between Thunder values and .NET values.
//
// Thunder -> .NET, to fit the method's parameter: a whole number becomes int, long, double, or decimal (whichever the
// parameter is, when it fits); a decimal number becomes decimal or double; money becomes its amount; text stays a
// string; yes/no a bool; nothing null; a list an array or a List of the parameter's element type; a date a DateTime
// at midnight. A value that came from .NET goes back unchanged.
// .NET -> Thunder: int, long, short, byte (and unsigned) become whole numbers; decimal becomes the exact decimal;
// double and float become the decimal they print as ("R"), so 0.1 stays 0.1; string, bool, and null as they are;
// arrays and lists become lists; anything else stays a library value that can be handed back to .NET.
// The method is chosen by name and by which overload every value fits, in the order .NET lists them, preferring one
// whose parameters need no widening. No fit: TC508 in words.
#nullable disable
namespace Thunder
{
    using System;
    using System.Collections;
    using System.Collections.Generic;
    using System.Globalization;
    using System.Linq;
    using System.Numerics;
    using System.Reflection;

    public sealed class DotnetLibrary
    {
        public readonly Type type; public readonly string name;
        public DotnetLibrary(Type type, string name) { this.type = type; this.name = name; }
    }

    public static class Dotnet
    {
        // Libraries may format by culture (words, dates). A program that uses .NET libraries runs with real culture
        // data, pinned to en-US, so it says the same thing on every machine.
        static Dotnet()
        {
            var c = CultureInfo.GetCultureInfo("en-US");
            CultureInfo.DefaultThreadCurrentCulture = c; CultureInfo.DefaultThreadCurrentUICulture = c;
            CultureInfo.CurrentCulture = c; CultureInfo.CurrentUICulture = c;
        }

        /** The type named `typeName`: in .NET itself, or in a package's assembly next to the program (NuGet). */
        public static DotnetLibrary library(string typeName)
        {
            var t = Type.GetType(typeName, false);
            if (t == null) foreach (var a in AppDomain.CurrentDomain.GetAssemblies()) { t = a.GetType(typeName, false); if (t != null) break; }
            if (t == null)
                foreach (var dll in System.IO.Directory.GetFiles(AppContext.BaseDirectory, "*.dll"))
                {
                    try { t = Assembly.LoadFrom(dll).GetType(typeName, false); } catch { }
                    if (t != null) break;
                }
            if (t == null) throw new ThunderErr("TC508", "There is no .NET type called \"" + typeName + "\". Write it with its namespace, as in \"System.IO.Path\"; a type from a package needs its NuGet line.", "LibraryError");
            return new DotnetLibrary(t, typeName);
        }

        sealed class NoFit { public static readonly NoFit It = new NoFit(); }

        static object to(object v, Type p, ref int cost)
        {
            var u = Nullable.GetUnderlyingType(p) ?? p;
            if (v == null || v is NotGiven) return (!p.IsValueType || Nullable.GetUnderlyingType(p) != null) ? null : NoFit.It;
            if (v is Money m) v = m.amount;
            if (u == typeof(object)) { cost += 3; return toPlain(v); }
            if (u.IsInstanceOfType(v) && !(v is Dec) && !(v is BigInteger)) return v;
            if (v is bool b) return u == typeof(bool) ? b : NoFit.It;
            if (v is string s) { if (u == typeof(string)) return s; if (u == typeof(char) && s.Length == 1) { cost += 1; return s[0]; } return NoFit.It; }
            if (v is BigInteger n)
            {
                try
                {
                    if (u == typeof(int) && n >= int.MinValue && n <= int.MaxValue) return (int)n;
                    if (u == typeof(long) && n >= long.MinValue && n <= long.MaxValue) { cost += 1; return (long)n; }
                    if (u == typeof(short) && n >= short.MinValue && n <= short.MaxValue) { cost += 2; return (short)n; }
                    if (u == typeof(byte) && n >= byte.MinValue && n <= byte.MaxValue) { cost += 2; return (byte)n; }
                    if (u == typeof(decimal)) { cost += 2; return (decimal)n; }
                    if (u == typeof(double)) { cost += 3; return (double)n; }
                    if (u == typeof(float)) { cost += 4; return (float)n; }
                    if (u == typeof(BigInteger)) return n;
                }
                catch (OverflowException) { }
                return NoFit.It;
            }
            if (v is Dec d)
            {
                var text = d.ToString();
                if (u == typeof(decimal) && decimal.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var dm)) return dm;
                if (u == typeof(double)) { cost += 1; return double.Parse(text, CultureInfo.InvariantCulture); }
                if (u == typeof(float)) { cost += 2; return float.Parse(text, CultureInfo.InvariantCulture); }
                return NoFit.It;
            }
            if (v is PyDate dt) return u == typeof(DateTime) ? new DateTime(dt.y, dt.m, dt.d) : u == typeof(DateOnly) ? new DateOnly(dt.y, dt.m, dt.d) : (object)NoFit.It;
            if (v is List<object> list)
            {
                Type el = u.IsArray ? u.GetElementType() : u.IsGenericType && u.GetGenericArguments().Length == 1 && (typeof(IEnumerable).IsAssignableFrom(u)) ? u.GetGenericArguments()[0] : null;
                if (el == null) return NoFit.It;
                var items = new List<object>();
                foreach (var x in list) { var c = to(x, el, ref cost); if (c is NoFit) return NoFit.It; items.Add(c); }
                if (u.IsArray) { var arr = Array.CreateInstance(el, items.Count); for (int i = 0; i < items.Count; i++) arr.SetValue(items[i], i); return arr; }
                var lt = typeof(List<>).MakeGenericType(el);
                if (!u.IsAssignableFrom(lt)) return NoFit.It;
                var l = (IList)Activator.CreateInstance(lt);
                foreach (var x in items) l.Add(x);
                return l;
            }
            return NoFit.It;
        }

        /** A Thunder value as the plainest .NET value, for an object parameter. */
        static object toPlain(object v)
        {
            if (v is BigInteger n) return n >= long.MinValue && n <= long.MaxValue ? (object)(long)n : n;
            if (v is Dec d) return decimal.TryParse(d.ToString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var dm) ? dm : (object)double.Parse(d.ToString(), CultureInfo.InvariantCulture);
            if (v is Money m) return toPlain(m.amount);
            if (v is PyDate dt) return new DateTime(dt.y, dt.m, dt.d);
            if (v is List<object> l) return l.Select(toPlain).ToList();
            return v;
        }

        /** A .NET value as a Thunder value. */
        public static object from(object v)
        {
            switch (v)
            {
                case null: return null;
                case string s: return s;
                case bool b: return b;
                case char c: return c.ToString();
                case int i: return new BigInteger(i);
                case long l: return new BigInteger(l);
                case short sh: return new BigInteger(sh);
                case byte by: return new BigInteger(by);
                case uint ui: return new BigInteger(ui);
                case ulong ul: return new BigInteger(ul);
                case BigInteger n: return n;
                case decimal dm: return Dec.Parse(dm.ToString(CultureInfo.InvariantCulture));
                case double db: if (double.IsNaN(db) || double.IsInfinity(db)) throw new ThunderErr("TC509", "The library gave back " + db.ToString(CultureInfo.InvariantCulture) + ", which is not a number Thunder can use.", "ValueError"); return Dec.Parse(db.ToString("R", CultureInfo.InvariantCulture));
                case float f: return Dec.Parse(((double)f).ToString("R", CultureInfo.InvariantCulture));
                case DateTime dt: return dt.TimeOfDay == TimeSpan.Zero ? new PyDate(dt.Year, dt.Month, dt.Day) : (object)dt;
                case DateOnly d: return new PyDate(d.Year, d.Month, d.Day);
                case IEnumerable e when !(v is IDictionary): { var list = new List<object>(); foreach (var x in e) list.Add(from(x)); return list; }
                default: return v;
            }
        }

        /** <library>.<method>(<args>): the static method of that name whose parameters every value fits. */
        public static object call(object lib, string method, object[] args)
        {
            var L = lib as DotnetLibrary;
            if (L == null) throw new ThunderErr("TC508", "\"" + method + "\" with a dot reaches into a library brought in with Use.", "LibraryError");
            var methods = L.type.GetMethods(BindingFlags.Public | BindingFlags.Static).Where((m) => m.Name == method).ToArray();
            if (methods.Length == 0) throw new ThunderErr("TC508", "The .NET type \"" + L.name + "\" has no method named \"" + method + "\".", "LibraryError");
            MethodInfo best = null; object[] bestArgs = null; int bestCost = int.MaxValue;
            foreach (var m in methods)
            {
                if (m.ContainsGenericParameters) continue;
                var ps = m.GetParameters();
                if (ps.Length < args.Length) continue;
                if (ps.Skip(args.Length).Any((p) => !p.HasDefaultValue)) continue;
                var conv = new object[ps.Length]; int cost = 0; bool ok = true;
                for (int i = 0; i < ps.Length && ok; i++)
                {
                    if (i >= args.Length) { conv[i] = ps[i].DefaultValue; cost += 1; continue; }
                    var c = to(args[i], ps[i].ParameterType, ref cost);
                    if (c is NoFit) ok = false; else conv[i] = c;
                }
                if (ok && cost < bestCost) { best = m; bestArgs = conv; bestCost = cost; }
            }
            if (best == null)
            {
                var kinds = string.Join(", ", args.Select((a) => T.typeName(a)));
                throw new ThunderErr("TC508", "No \"" + L.name + "." + method + "\" takes " + (args.Length == 0 ? "no values" : "these values (" + kinds + ")") + ". It takes: " + string.Join("; ", methods.Select((m) => "(" + string.Join(", ", m.GetParameters().Select((p) => p.ParameterType.Name + " " + p.Name)) + ")")) + ".", "LibraryError");
            }
            try { return from(best.Invoke(null, bestArgs)); }
            catch (TargetInvocationException e) when (e.InnerException != null)
            {
                if (e.InnerException is TErr te) throw te;
                // The innermost cause says why (a type that failed to start up wraps the real reason).
                var cause = e.InnerException;
                while ((cause is TypeInitializationException || cause is TargetInvocationException) && cause.InnerException != null) cause = cause.InnerException;
                throw new ThunderErr("TC508", ".NET code used by this line failed: " + cause.GetType().Name + ": " + cause.Message, "LibraryError");
            }
        }

        /** <library>.<name> without a call: a static property or field. */
        public static object get(object lib, string name)
        {
            var L = lib as DotnetLibrary;
            var p = L?.type.GetProperty(name, BindingFlags.Public | BindingFlags.Static);
            if (p != null) return from(p.GetValue(null));
            var f = L?.type.GetField(name, BindingFlags.Public | BindingFlags.Static);
            if (f != null) return from(f.GetValue(null));
            throw new ThunderErr("TC508", "The .NET type \"" + L?.name + "\" has nothing named \"" + name + "\".", "LibraryError");
        }
    }
}

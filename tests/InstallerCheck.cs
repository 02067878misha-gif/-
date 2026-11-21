using System;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;

internal static class InstallerCheck
{
    public static void Run(string exe, string package)
    {
        var assembly = Assembly.LoadFile(Path.GetFullPath(exe));
        var method = assembly.GetType("StrataDraw.Setup.InstallFiles", true).GetMethod("InstallEmbedded");
        string dir = Directory.CreateTempSubdirectory("strata-setup-check-").FullName;
        try
        {
            using var embedded = assembly.GetManifestResourceStream("StrataDraw.Payload.zip");
            using var release = File.OpenRead(package);
            if (!SHA256.HashData(embedded).SequenceEqual(SHA256.HashData(release)))
                throw new Exception("Setup payload differs from release ZIP.");

            string Install() => (string)method.Invoke(null, new object[] { dir });
            string target = Install();
            using var zip = ZipFile.OpenRead(package);
            void Verify()
            {
                foreach (var entry in zip.Entries.Where(e => e.FullName.StartsWith("StrataDraw/")))
                {
                    using var expected = entry.Open();
                    using var actual = File.OpenRead(Path.Combine(target, entry.FullName.Substring("StrataDraw/".Length)));
                    if (!SHA256.HashData(expected).SequenceEqual(SHA256.HashData(actual))) throw new Exception(entry.FullName);
                }
            }
            Verify();
            string note = Path.Combine(target, "custom-file.txt");
            File.WriteAllText(note, "keep");
            File.WriteAllText(Path.Combine(target, "StrataDraw.dll"), "old version");
            Install();
            Verify();
            if (File.ReadAllText(note) != "keep") throw new Exception("Existing additional file lost.");

            Directory.Move(target, Path.Combine(dir, ".StrataDraw-Setup", "previous"));
            Install();
            Verify();
            if (File.ReadAllText(note) != "keep") throw new Exception("Recovery lost previous contents.");

            File.Delete(Path.Combine(target, "CorelDrw.addon"));
            try { Install(); throw new Exception("Foreign folder accepted."); }
            catch (TargetInvocationException e) when (e.InnerException is IOException) { }
            if (File.ReadAllText(note) != "keep") throw new Exception("Foreign folder modified.");
            Console.WriteLine("EXE verified: embedded release, installation, update, interrupted update recovery and foreign-folder protection.");
        }
        finally { Directory.Delete(dir, true); }
    }
}

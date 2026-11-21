using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;

namespace StrataDraw.Setup
{
    internal static class InstallFiles
    {
        private static void RejectLink(string path)
        {
            if ((File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0)
                throw new IOException("Каталог установки содержит ссылку: " + path);
        }

        private static void CopyContents(string from, string to)
        {
            foreach (string path in Directory.GetFileSystemEntries(from))
            {
                RejectLink(path);
                string destination = Path.Combine(to, Path.GetFileName(path));
                if (Directory.Exists(path))
                {
                    Directory.CreateDirectory(destination);
                    CopyContents(path, destination);
                }
                else File.Copy(path, destination);
            }
        }

        private static void Unpack(Stream payload, string stage)
        {
            const string prefix = "StrataDraw/";
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            using (var package = new ZipArchive(payload, ZipArchiveMode.Read, true))
            {
                foreach (var entry in package.Entries.Where(e => e.FullName.StartsWith(prefix, StringComparison.Ordinal)))
                {
                    if (entry.Name.Length == 0) continue;
                    string name = entry.FullName.Substring(prefix.Length);
                    if (name.Split('/').Any(part => part.Length == 0 || part == "." || part == ".." ||
                            part.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0 || part.Contains("\\") || part.Contains(":")) ||
                        !seen.Add(name))
                        throw new InvalidDataException("Недопустимый путь в пакете: " + name);
                    string destination = Path.Combine(stage, name.Replace('/', Path.DirectorySeparatorChar));
                    Directory.CreateDirectory(Path.GetDirectoryName(destination));
                    using (var input = entry.Open())
                    using (var output = File.Create(destination))
                    {
                        input.CopyTo(output);
                        if (output.Length != entry.Length)
                            throw new InvalidDataException("Неполный файл: " + name);
                    }
                }
            }
            foreach (string required in new[] { "StrataDraw.dll", "CorelDrw.addon", "AppUI.xslt", "UserUI.xslt",
                "NetTopologySuite.dll", "data/tiles.tsv", "data/fgdc.zip", "data/symbols.zip", "data/ages.tsv" })
                if (!seen.Contains(required)) throw new InvalidDataException("В пакете отсутствует " + required);
        }

        public static string InstallEmbedded(string programDir)
        {
            var assembly = typeof(InstallFiles).Assembly;
            using (var payload = assembly.GetManifestResourceStream("StrataDraw.Payload.zip"))
            using (var checksum = new StreamReader(assembly.GetManifestResourceStream("StrataDraw.Payload.sha256")))
            using (var sha = System.Security.Cryptography.SHA256.Create())
            {
                string actual = BitConverter.ToString(sha.ComputeHash(payload)).Replace("-", "");
                if (!actual.Equals(checksum.ReadToEnd().Trim(), StringComparison.OrdinalIgnoreCase))
                    throw new InvalidDataException("Повреждён установочный пакет. Скачайте установщик заново.");
                payload.Position = 0;
                return Install(payload, programDir);
            }
        }

        private static string Install(Stream payload, string programDir)
        {
            if (!Directory.Exists(programDir)) throw new DirectoryNotFoundException(programDir);
            RejectLink(programDir);
            string work = Path.Combine(programDir, ".StrataDraw-Setup");
            string addons = Path.Combine(programDir, "Addons");
            Directory.CreateDirectory(work); RejectLink(work);
            Directory.CreateDirectory(addons); RejectLink(addons);
            string target = Path.Combine(addons, "StrataDraw");
            string backup = Path.Combine(work, "previous");
            using (new FileStream(Path.Combine(work, "install.lock"), FileMode.OpenOrCreate, FileAccess.Write, FileShare.None))
            {
                // If the machine stopped between the two directory renames, recover first.
                if (Directory.Exists(backup))
                {
                    RejectLink(backup);
                    if (!Directory.Exists(target)) Directory.Move(backup, target);
                    else Directory.Move(backup, Path.Combine(work, "recovered-" + Guid.NewGuid().ToString("N")));
                }
                string stage = Path.Combine(work, Guid.NewGuid().ToString("N"));
                Directory.CreateDirectory(stage);
                try
                {
                    if (Directory.Exists(target))
                    {
                        RejectLink(target);
                        if (Directory.EnumerateFileSystemEntries(target).Any() &&
                            !(File.Exists(Path.Combine(target, "CorelDrw.addon")) && File.Exists(Path.Combine(target, "StrataDraw.dll"))))
                            throw new IOException("В папке StrataDraw уже есть файлы неизвестного дополнения: " + target);
                        CopyContents(target, stage);
                    }
                    Unpack(payload, stage);
                    if (Directory.Exists(target)) Directory.Move(target, backup);
                    try { Directory.Move(stage, target); }
                    catch
                    {
                        if (Directory.Exists(backup)) Directory.Move(backup, target);
                        throw;
                    }
                    if (Directory.Exists(backup))
                    {
                        // The old installation is recoverable even if cleanup is interrupted.
                        try { Directory.Delete(backup, true); }
                        catch (IOException) { }
                        catch (UnauthorizedAccessException) { }
                    }
                }
                finally { if (Directory.Exists(stage)) Directory.Delete(stage, true); }
            }
            return target;
        }
    }
}

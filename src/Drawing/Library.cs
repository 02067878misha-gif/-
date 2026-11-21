using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Xml.Linq;

namespace StrataDraw
{
    public class Entry
    {
        public string Name, Key, Color, Index, Location;
        public double NativeWidth, Age;
        public override string ToString() => Name;
    }
    public static class Library
    {
        public static List<Entry> Tiles(string root) => File.ReadLines(Path.Combine(root, "tiles.tsv"))
            .Select(l => l.Split('\t')).Select(v => new Entry { Name = "FGDC " + v[0] + " " + v[1], Key = v[0] + ".svg", NativeWidth = double.Parse(v[2], CultureInfo.InvariantCulture), Location = Path.Combine(root, "fgdc.zip") })
            .Concat(NamedTiles(root, "basic", "Базовый профиль 2013 · "))
            .Concat(RockPatterns(root)).ToList();

        public static List<Entry> RockPatterns(string root) => NamedTiles(root, "sdar", "").ToList();

        private static IEnumerable<Entry> NamedTiles(string root, string catalog, string prefix) =>
            File.ReadLines(Path.Combine(root, catalog + ".tsv")).Select(l => l.Split('\t')).Select(v => new Entry
            {
                Name = prefix + v[1],
                Key = v[0],
                NativeWidth = double.Parse(v[2], CultureInfo.InvariantCulture),
                Location = Path.Combine(root, catalog + ".zip")
            });
        public static List<Entry> Symbols(string root)
        {
            string file = Path.Combine(root, "symbols.zip");
            using (var stream = File.OpenRead(file))
            using (var zip = new ZipArchive(stream))
                return zip.Entries.Select(e => new Entry
                {
                    Name = e.FullName.Substring(0, e.FullName.Length - 4).Replace('_', ' '),
                    Key = e.FullName,
                    Location = file
                }).OrderBy(x => x.Name, StringComparer.Ordinal).ToList();
        }
        public static List<Entry> Ages(string root) => File.ReadLines(Path.Combine(root, "ages.tsv"))
            .Select(l => l.Split('\t')).Select(v => new Entry
            {
                Name = v[6] + " / " + v[1] + " · " + v[4] + " · " + v[2] + "–" + v[3] + " Ma",
                Key = v[0],
                Age = double.Parse(v[3], CultureInfo.InvariantCulture),
                Color = v[5],
                Index = v[4]
            }).ToList();
        public static List<Entry> ScaleXml(string path)
        {
            var doc = XDocument.Load(path);
            var entries = doc.Descendants("unit").Where(u => u.Attribute("color") != null).Select(u =>
            {
                string name = (string)u.Attribute("name"), code = (string)u.Attribute("index") ?? name;
                return new Entry
                {
                    Name = name + " · " + code + " · " + (string)u.Attribute("from") + "–" + (string)u.Attribute("to") + " Ma",
                    Key = (string)u.Attribute("level"),
                    Age = double.TryParse((string)u.Attribute("to"), NumberStyles.Float, CultureInfo.InvariantCulture, out var age) ? age : 0,
                    Color = (string)u.Attribute("color"),
                    Index = code.Replace(",,", "")
                };
            }).ToList();
            if (entries.Count == 0) throw new FormatException("Шкала должна содержать элементы unit с цветом.");
            return entries;
        }
        public static void WithFile(Entry e, Action<string> action)
        {
            if (e.Key == null) { action(e.Location); return; }
            string path = Path.Combine(Path.GetTempPath(), Guid.NewGuid() + ".svg");
            try
            {
                using (var stream = File.OpenRead(e.Location))
                using (var zip = new ZipArchive(stream))
                using (var input = zip.GetEntry(e.Key).Open())
                using (var dest = File.Create(path)) input.CopyTo(dest);
                action(path);
            }
            finally { File.Delete(path); }
        }
    }
}

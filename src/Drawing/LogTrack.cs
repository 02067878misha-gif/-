using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace StrataDraw
{
    public sealed class LogTrack
    {
        public int Column, Track;
        public double? Min, Max;
        public double Width = .26;
        public bool Log, Reverse, Fill;
        public string Color;
        // Optional per-curve definitions. Several curves may share the same track.
        public static LogTrack[] Read(string text, int[] columns)
        {
            var styles = columns.Select((c, i) => new LogTrack { Column = c, Track = i + 1 }).ToDictionary(t => t.Column);
            if (!string.IsNullOrWhiteSpace(text))
                foreach (var raw in text.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
                {
                    var fields = raw.Trim().Split(';').Select(x => x.Trim()).ToArray();
                    if (fields.Length < 2 || fields.Length > 8 || !int.TryParse(fields[0], out int column) ||
                        !styles.TryGetValue(column, out var t) || !int.TryParse(fields[1], out int track) || track < 1)
                        throw new FormatException("Формат настройки: кривая;дорожка;мин;макс;режим;цвет;толщина;заливка.");
                    t.Track = track;
                    if (fields.Length > 2 && fields[2] != "") t.Min = Number(fields[2]);
                    if (fields.Length > 3 && fields[3] != "") t.Max = Number(fields[3]);
                    var mode = fields.Length > 4 ? fields[4].ToLowerInvariant() : "";
                    if (!new[] { "", "lin", "log", "rev", "log-rev" }.Contains(mode)) throw new FormatException("Режим кривой: lin, log, rev или log-rev.");
                    t.Log = mode.Contains("log"); t.Reverse = mode.Contains("rev");
                    if (fields.Length > 5 && fields[5] != "")
                    {
                        if (!System.Text.RegularExpressions.Regex.IsMatch(fields[5], "^#[A-Fa-f0-9]{6}$")) throw new FormatException("Цвет каротажной кривой: #RRGGBB.");
                        t.Color = fields[5];
                    }
                    if (fields.Length > 6 && fields[6] != "") t.Width = Number(fields[6]);
                    if (t.Width <= 0 || t.Width > 20 || (t.Min.HasValue && t.Max.HasValue && t.Min >= t.Max) || (t.Log && (t.Min <= 0 || t.Max <= 0)))
                        throw new FormatException("Проверьте толщину и диапазон шкалы кривой.");
                    t.Fill = fields.Length > 7 && fields[7] == "1";
                }
            return columns.Select(c => styles[c]).ToArray();
        }
        private static double Number(string v)
        {
            if (!double.TryParse(v.Replace(',', '.'), NumberStyles.Float, CultureInfo.InvariantCulture, out var n) ||
               double.IsNaN(n) || double.IsInfinity(n)) throw new FormatException("Некорректное число в настройках дорожки.");
            return n;
        }
    }
}

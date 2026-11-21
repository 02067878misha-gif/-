using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Xml.Linq;

namespace StrataDraw
{
    public sealed class Survey
    {
        public string Title = "";
        public string[] Names, Units;
        public readonly List<double?[]> Rows = new List<double?[]>();
        public double DepthUnit = 1;
        private static string[] Words(string s) => Regex.Split(s.Trim(), @"\s+");
        private static double Parse(string s)
        {
            double n;
            if (!double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out n) ||
                double.IsNaN(n) || double.IsInfinity(n)) throw new FormatException("Некорректное число: " + s);
            return n;
        }

        public static Survey Las(IEnumerable<string> lines)
        {
            var table = new Survey();
            var names = new List<string>(); var units = new List<string>();
            var pending = new List<double?>();
            string section = "", delimiter = "SPACE";
            bool wrapped = false; double nullValue = -999.25;
            int line = 0;
            foreach (string raw in lines)
            {
                line++;
                string s = raw.Trim();
                if (s.Length == 0 || s.StartsWith("#")) continue;
                if (s.StartsWith("~")) { section = s.Substring(1).Trim().ToUpperInvariant(); continue; }
                if (section.StartsWith("A"))
                {
                    if (names.Count < 2) throw new FormatException("В LAS отсутствует список кривых.");
                    string[] fields = delimiter == "COMMA" ? s.Split(',') : Words(s);
                    if (!wrapped && fields.Length != names.Count)
                        throw new FormatException("Число столбцов LAS, строка " + line);
                    foreach (string token in fields)
                    {
                        double v = Parse(token.Trim());
                        pending.Add(v == nullValue ? (double?)null : v);
                        if (pending.Count == names.Count) { table.Rows.Add(pending.ToArray()); pending.Clear(); }
                    }
                    continue;
                }
                if (!(section.StartsWith("W") || section.StartsWith("C") || section.StartsWith("V"))) continue;
                string entry = s.Split(':')[0].TrimEnd();
                int dot = entry.IndexOf('.');
                if (dot < 1) continue;
                string key = entry.Substring(0, dot).Trim(), tail = entry.Substring(dot + 1);
                var match = Regex.Match(tail, @"^(\S*)\s*(.*)$");
                string unit = match.Groups[1].Value, value = match.Groups[2].Value.Trim();
                if (section.StartsWith("C")) { names.Add(key); units.Add(unit); continue; }
                switch (key.ToUpperInvariant())
                {
                    case "NULL": nullValue = Parse(value); break;
                    case "WRAP": wrapped = value.Equals("YES", StringComparison.OrdinalIgnoreCase); break;
                    case "DLM": delimiter = value.ToUpperInvariant(); break;
                    case "WELL": table.Title = value; break;
                }
            }
            if (pending.Count != 0) throw new FormatException("Неполная запись в конце LAS.");
            if (names.Count < 2 || table.Rows.Count < 2 || table.Rows.Any(r => !r[0].HasValue))
                throw new FormatException("Нужны глубины и хотя бы одна каротажная кривая.");
            table.Names = names.ToArray(); table.Units = units.ToArray();
            string du = units[0].ToUpperInvariant();
            if (du == "FT" || du == "F") table.DepthUnit = .3048;
            else if (du == "CM") table.DepthUnit = .01;
            else if (du == "MM") table.DepthUnit = .001;
            else if (du != "M" && du != "М" && du != "") throw new FormatException("Неизвестная единица глубины: " + du);
            return table;
        }

        public static Survey Horizons(IEnumerable<string> lines, bool header, int skip, int fixedWidth = 0)
        {
            var table = new Survey();
            int count = 0;
            foreach (string s in lines.Skip(skip).Where(x => x.Trim().Length > 0 && !x.TrimStart().StartsWith("#")))
            {
                string[] fields;
                if (fixedWidth > 0)
                    fields = Enumerable.Range(0, (s.Length + fixedWidth - 1) / fixedWidth).Select(i => s.Substring(i * fixedWidth, Math.Min(fixedWidth, s.Length - i * fixedWidth)).Trim()).ToArray();
                else if (s.Contains(";")) fields = s.Split(';');
                else if (s.Contains("\t")) fields = s.Split('\t');
                else if (s.Contains(",")) fields = s.Split(',');
                else fields = Words(s);
                if (count == 0)
                {
                    count = fields.Length;
                    if (count < 2) throw new FormatException("Нужны X и одна или несколько отметок горизонтов.");
                    table.Names = header ? fields.Select(x => x.Trim()).ToArray() :
                        Enumerable.Range(0, count).Select(i => i == 0 ? "X" : "Горизонт " + i).ToArray();
                    table.Units = new string[count];
                    if (header) continue;
                }
                if (fields.Length != count) throw new FormatException("Разное число столбцов в таблице.");
                var row = fields.Select(x => string.IsNullOrWhiteSpace(x) || x.Trim() == "-" || x.Trim().Equals("NA", StringComparison.OrdinalIgnoreCase)
                    ? (double?)null : Parse(x.Trim().Replace(',', '.'))).ToArray();
                if (!row[0].HasValue) throw new FormatException("Пропуск координаты X.");
                table.Rows.Add(row);
            }
            if (table.Rows.Count < 2) throw new FormatException("В таблице менее двух строк измерений.");
            return table;
        }
    }

    public class PlotOptions
    {
        public double ScaleX = 1000, ScaleY = 200, TrackWidth = 35, Gap = 4, XToMeters = 1, YToMeters = 1;
        public bool Grid = true, Frame = true, Title = true, PositiveDown;
        public string Stamp = "", Tracks = "";
        public double DepthStep, Simplify;
        public bool Triple, XAxis = true, YAxis = true;
        public int[] Columns;
    }

    public static class SectionPlot
    {
        static readonly XNamespace S = "http://www.w3.org/2000/svg";
        static readonly string[] Ink = { "#175779", "#9c4425", "#326843", "#5a4887", "#8d6222" };
        static string N(double v) => v.ToString("0.####", CultureInfo.InvariantCulture);
        static XElement Text(double x, double y, string t) => new XElement(S + "text",
            new XAttribute("x", N(x)), new XAttribute("y", N(y)), new XAttribute("font-size", "2.6"),
            new XAttribute("font-family", "Arial, sans-serif"), t);
        static XElement Rule(double x, double y, double xx, double yy, string c = "#acb7be") =>
            new XElement(S + "path", new XAttribute("d", "M" + N(x) + " " + N(y) + " L" + N(xx) + " " + N(yy)),
                new XAttribute("stroke", c), new XAttribute("stroke-width", ".18"), new XAttribute("fill", "none"));

        public static XElement Draw(Survey t, bool las, PlotOptions o)
        {
            var cols = o.Columns ?? Enumerable.Range(1, t.Names.Length - 1).ToArray();
            if (cols.Length == 0 || cols.Any(c => c <= 0 || c >= t.Names.Length)) throw new ArgumentException("Выберите столбцы данных.");
            var tracks = LogTrack.Read(las ? o.Tracks : "", cols);
            int[] lanes = tracks.Select(tk => tk.Track).Distinct().OrderBy(x => x).ToArray();
            double dx = 1000 * o.XToMeters / o.ScaleX, dy = 1000 * (las ? t.DepthUnit : o.YToMeters) / o.ScaleY;
            double minX = t.Rows.Min(r => r[0].Value), maxX = t.Rows.Max(r => r[0].Value);
            var values = t.Rows.SelectMany(r => cols.Select(i => r[i])).Where(v => v.HasValue).Select(v => v.Value).ToArray();
            if (values.Length == 0 || dy <= 0 || dx <= 0 || o.TrackWidth <= 0) throw new ArgumentException("Проверьте данные и масштабы.");
            double minY = las ? minX : values.Min(), maxY = las ? maxX : values.Max();
            double chartW = las ? lanes.Length * (o.TrackWidth + o.Gap) - o.Gap : Math.Max(1, (maxX - minX) * dx);
            double chartH = Math.Max(1, (maxY - minY) * dy);
            if (chartH > 100000 || chartW > 100000) throw new ArgumentException("Выберите меньший масштаб чертежа.");
            const double left = 22;
            double top = las ? 9 + 8 * tracks.GroupBy(tk => tk.Track).Max(g => g.Count()) : 17;
            double w = chartW + left + 6, h = chartH + top + 18;
            var svg = new XElement(S + "svg", new XAttribute("width", N(w) + "mm"), new XAttribute("height", N(h) + "mm"),
                new XAttribute("viewBox", "0 0 " + N(w) + " " + N(h)));
            if (o.Title) svg.Add(Text(left, 4, t.Title.Length > 0 ? t.Title : (las ? "Каротаж" : "Геологические горизонты")));
            if (!las && o.XAxis)
            {
                double xStep = Math.Pow(10, Math.Floor(Math.Log10(20 / dx)));
                if (xStep * dx < 8) xStep *= 5;
                for (double x = Math.Ceiling(minX / xStep) * xStep; x <= maxX; x += xStep)
                {
                    double u = left + (x - minX) * dx;
                    svg.Add(Rule(u, top + chartH, u, top + chartH + 1), Text(u, top + chartH + 4, N(x)));
                    if (o.Grid) svg.Add(Rule(u, top, u, top + chartH));
                    if (x + xStep == x) break;
                }
            }
            double step = Math.Pow(10, Math.Floor(Math.Log10(Math.Max(.000001, 12 / dy))));
            if (step * dy < 6) step *= 5;
            if (step * dy < 6) step *= 2;
            if (o.DepthStep > 0) step = o.DepthStep;
            if ((maxY - minY) / step > 10000) throw new ArgumentException("Увеличьте шаг шкалы глубины.");
            Func<double, double> yAt = v => top + (las || o.PositiveDown ? v - minY : maxY - v) * dy;
            for (double v = Math.Ceiling(minY / step) * step; v <= maxY; v += step)
            {
                double y = yAt(v);
                if (o.YAxis) svg.Add(Text(1, y + 1, N(v)), Rule(left - 1, y, left, y));
                if (o.Grid) svg.Add(Rule(left, y, left + chartW, y));
                if (v + step == v) break;
            }
            for (int j = 0; j < cols.Length; j++)
            {
                int c = cols[j]; LogTrack track = tracks[j]; string color = track.Color ?? Ink[j % Ink.Length];
                var vals = t.Rows.Where(r => r[c].HasValue && (!track.Log || r[c] > 0)).Select(r => r[c].Value).ToArray();
                if (vals.Length == 0) continue;
                double lo = track.Min ?? vals.Min(), hi = track.Max ?? vals.Max();
                if (hi < lo) throw new ArgumentException("Верхний предел шкалы меньше нижнего.");
                double start = left + (las ? Array.IndexOf(lanes, track.Track) * (o.TrackWidth + o.Gap) : 0);
                Func<double, double> frac = v =>
                {
                    double f = hi == lo ? .5 : track.Log ? Math.Log(v / lo) / Math.Log(hi / lo) : (v - lo) / (hi - lo);
                    return Math.Min(1, Math.Max(0, track.Reverse ? 1 - f : f));
                };
                if (las)
                {
                    double row = tracks.Take(j).Count(tk => tk.Track == track.Track) * 8;
                    var heading = Text(start, 9 + row, t.Names[c] + " " + t.Units[c]); heading.SetAttributeValue("fill", color);
                    svg.Add(heading, Text(start, 13 + row, (track.Reverse ? N(hi) + " … " + N(lo) : N(lo) + " … " + N(hi)) + (track.Log ? " log" : "")));
                    if (o.Frame) svg.Add(Rule(start, top, start, top + chartH), Rule(start + o.TrackWidth, top, start + o.TrackWidth, top + chartH));
                }
                var segment = new System.Collections.Generic.List<NetTopologySuite.Geometries.Coordinate>();
                bool named = false;
                Action finish = () =>
                {
                    if (segment.Count == 0) return;
                    var points = segment.ToArray();
                    if (points.Length > 2 && o.Simplify > 0)
                        points = NetTopologySuite.Simplify.DouglasPeuckerSimplifier.Simplify(Contours.Line(points), o.Simplify).Coordinates;
                    if (points.Length == 1)
                        svg.Add(new XElement(S + "circle", new XAttribute("cx", N(points[0].X)), new XAttribute("cy", N(points[0].Y)),
                            new XAttribute("r", N(track.Width / 2)), new XAttribute("fill", color)));
                    else
                    {
                        string path = "M" + string.Join(" L", points.Select(p => N(p.X) + " " + N(p.Y)));
                        if (las && track.Fill)
                            svg.Add(new XElement(S + "path", new XAttribute("d", path + " L" + N(start) + " " + N(points.Last().Y) + " L" + N(start) + " " + N(points[0].Y) + " Z"),
                                new XAttribute("fill", color), new XAttribute("fill-opacity", ".20")));
                        svg.Add(new XElement(S + "path", new XAttribute("d", path), new XAttribute("fill", "none"),
                            new XAttribute("stroke", color), new XAttribute("stroke-width", N(track.Width))));
                    }
                    segment.Clear();
                };
                foreach (var r in t.Rows)
                {
                    if (!r[c].HasValue || (track.Log && r[c] <= 0)) { finish(); continue; }
                    double x = las ? start + frac(r[c].Value) * o.TrackWidth : left + (r[0].Value - minX) * dx;
                    double y = yAt(las ? r[0].Value : r[c].Value);
                    if (!las && !named) { svg.Add(Text(x + 1, y - 1, t.Names[c])); named = true; }
                    segment.Add(new NetTopologySuite.Geometries.Coordinate(x, y));
                }
                finish();
            }
            if (o.Frame) svg.Add(new XElement(S + "rect", new XAttribute("x", left), new XAttribute("y", top),
                new XAttribute("width", N(chartW)), new XAttribute("height", N(chartH)), new XAttribute("fill", "none"),
                new XAttribute("stroke", "#273842"), new XAttribute("stroke-width", ".25")));
            if (o.Frame && o.Triple)
                foreach (int inset in new[] { 1, 2 })
                    svg.Add(new XElement(S + "rect", new XAttribute("x", N(left - inset)), new XAttribute("y", N(top - inset)),
                        new XAttribute("width", N(chartW + 2 * inset)), new XAttribute("height", N(chartH + 2 * inset)),
                        new XAttribute("fill", "none"), new XAttribute("stroke", "#273842"), new XAttribute("stroke-width", inset == 1 ? ".5" : ".18")));
            svg.Add(Text(left, h - 4, (las ? "Глубина, " + t.Units[0] : "X: " + N(minX) + " … " + N(maxX)) + (las ? "   М 1:" + N(o.ScaleY) + "   " + N(minY) + "–" + N(maxY) + "   Δ " + N(Math.Abs(t.Rows[1][0].Value - t.Rows[0][0].Value)) : "   Г 1:" + N(o.ScaleX) + "   В 1:" + N(o.ScaleY)) + "   " + o.Stamp));
            return svg;
        }
    }
}

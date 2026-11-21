using System;
using System.Collections.Generic;
using System.Linq;
using NetTopologySuite.Geometries;

namespace StrataDraw
{
    public enum LineForm { Solid, Dash, Wave, Saw }
    public enum Mark { None, Tick, Cross, Triangle, Circle, Square, Diamond, Arrow, Chevron, Bar, Dot, HalfCircle, DoubleTick }

    public class LineStyle
    {
        public LineForm Form;
        public string Color = "#222222";
        public double Width = 0.25, Pitch = 5, Amplitude = 1, Dash = 3, Gap = 1;
        public double Parallel, ParallelWidth = 0.2, MarkPitch = 6, MarkGap = 1;
        public double MarkWidth = 1.5, MarkHeight = 1, Offset;
        public int Frequency = 1;
        public bool Reverse, ParallelEnabled, StraightBetween;
        public double[] DashSequence;
        public LineSymbol[] Custom;
        public Mark[] Marks = new Mark[0];
    }

    public class LineSymbol
    {
        public Mark Mark;
        public double Width, Height, Offset;
        public int Every = 1;
        public bool OnGap;
        public static LineSymbol[] Parse(string text)
        {
            if (string.IsNullOrWhiteSpace(text)) return null;
            var group = new List<LineSymbol>();
            foreach (var row in text.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
            {
                var f = row.Split(';').Select(v => v.Trim()).ToArray();
                if (f.Length != 5 || !Enum.TryParse(f[0], true, out Mark mark) || !Enum.IsDefined(typeof(Mark), mark) ||
                    !int.TryParse(f[4], out int every) || every < 1)
                    throw new FormatException("Знак: тип;ширина;высота;верх/центр/низ/пробел;частота.");
                double w = ReadSize(f[1]), h = ReadSize(f[2]);
                string pos = f[3].ToLowerInvariant();
                if (pos == "upper") pos = "верх"; else if (pos == "lower") pos = "низ"; else if (pos == "center") pos = "центр"; else if (pos == "gap") pos = "пробел";
                if (!new[] { "верх", "центр", "низ", "пробел" }.Contains(pos)) throw new FormatException("Неизвестное положение знака.");
                group.Add(new LineSymbol
                {
                    Mark = mark,
                    Width = w,
                    Height = h,
                    Every = every,
                    Offset = pos == "низ" ? -h : pos == "верх" ? 0 : -h / 2,
                    OnGap = pos == "пробел"
                });
            }
            return group.ToArray();
        }
        public static double ReadSize(string value)
        {
            if (!double.TryParse(value.Replace(',', '.'), System.Globalization.NumberStyles.Float,
                System.Globalization.CultureInfo.InvariantCulture, out double n) || !(n >= .01 && n <= 1000))
                throw new FormatException("Размер должен быть от 0,01 до 1000 мм.");
            return n;
        }
    }
    public static class Linework
    {
        private static Coordinate P(double x, double y) => new Coordinate(x, y);
        public static IEnumerable<Coordinate[]> Glyph(Mark m)
        {
            switch (m)
            {
                case Mark.Tick: yield return new[] { P(0, 0), P(0, 1) }; break;
                case Mark.DoubleTick: yield return new[] { P(-.3, 0), P(-.3, 1) }; yield return new[] { P(.3, 0), P(.3, 1) }; break;
                case Mark.Cross: yield return new[] { P(-.5, .5), P(.5, .5) }; yield return new[] { P(0, 0), P(0, 1) }; break;
                case Mark.Triangle: yield return new[] { P(-.5, 0), P(0, 1), P(.5, 0), P(-.5, 0) }; break;
                case Mark.Square: yield return new[] { P(-.5, 0), P(-.5, 1), P(.5, 1), P(.5, 0), P(-.5, 0) }; break;
                case Mark.Diamond: yield return new[] { P(0, 0), P(-.5, .5), P(0, 1), P(.5, .5), P(0, 0) }; break;
                case Mark.Arrow: yield return new[] { P(-.5, .5), P(.5, .5), P(0, 1) }; yield return new[] { P(.5, .5), P(0, 0) }; break;
                case Mark.Chevron: yield return new[] { P(-.5, 1), P(0, 0), P(.5, 1) }; break;
                case Mark.Bar: yield return new[] { P(-.5, .5), P(.5, .5) }; break;
                case Mark.HalfCircle:
                case Mark.Circle:
                case Mark.Dot:
                    double angle = m == Mark.HalfCircle ? Math.PI : 2 * Math.PI;
                    double radius = m == Mark.Dot ? .16 : .5;
                    yield return Enumerable.Range(0, 25).Select(i =>
                        P(radius * Math.Cos(angle * i / 24), (m == Mark.HalfCircle ? 0 : .5) + radius * Math.Sin(angle * i / 24))).ToArray();
                    break;
            }
        }

        public static List<LineString> Draw(LineString source, LineStyle style)
        {
            if (style.Pitch <= 0 || style.Dash <= 0 || style.Gap <= 0 || style.MarkPitch <= 0 ||
                style.Frequency < 1) throw new ArgumentException("Шаг линии должен быть положительным.");
            var path = style.Reverse ? (LineString)source.Reverse() : source;
            var trace = new Trace(path);
            var lines = new List<LineString>();
            if (style.Form == LineForm.Dash)
            {
                double[] rhythm = style.DashSequence ?? new[] { style.Dash, style.Gap };
                if (rhythm.Length < 2 || rhythm.Length % 2 != 0 || rhythm.Any(v => !(v > 0)))
                    throw new ArgumentException("Последовательность должна содержать пары штрих–пробел.");
                double at = 0; int index = 0;
                while (at < trace.Length)
                {
                    if (lines.Count > 100000) throw new ArgumentException("Слишком мелкий пунктир.");
                    lines.Add(Contours.Line(trace.Slice(at, Math.Min(at + rhythm[index], trace.Length))));
                    at += rhythm[index] + rhythm[index + 1]; index = (index + 2) % rhythm.Length;
                }
            }
            else if (style.Form == LineForm.Solid) lines.Add(path);
            else
            {
                int steps = Samples(trace.Length, style.Pitch / 20);
                var points = new Coordinate[steps + 1];
                for (int i = 0; i <= steps; i++)
                {
                    double d = i * trace.Length / steps, phase = d / style.Pitch;
                    double wave = style.Form == LineForm.Wave ? Math.Sin(2 * Math.PI * phase)
                        : 2 / Math.PI * Math.Asin(Math.Sin(2 * Math.PI * phase));
                    points[i] = trace.At(d, style.StraightBetween && (int)phase % 2 == 1 ? 0 : style.Amplitude * wave);
                }
                lines.Add(Contours.Line(points));
            }
            var group = style.Custom ?? style.Marks.Select(m => new LineSymbol { Mark = m, Width = style.MarkWidth, Height = style.MarkHeight, Offset = style.Offset, Every = 1 }).ToArray();
            if (group.Length == 0) return lines;
            double repeat = style.MarkPitch * style.Frequency;
            if (trace.Length / repeat * group.Length > 50000) throw new ArgumentException("Увеличьте интервал знаков.");
            double groupWidth = group.Sum(m => m.Width) + style.MarkGap * (group.Length - 1);
            int ordinal = 0;
            for (double at = style.MarkPitch / 2; at <= trace.Length; at += repeat, ordinal++)
            {
                double left = at - groupWidth / 2;
                foreach (var symbol in group)
                {
                    double d = left + symbol.Width / 2;
                    left += symbol.Width + style.MarkGap;
                    if (ordinal % symbol.Every != 0) continue;
                    if (symbol.OnGap && style.Form == LineForm.Dash)
                    {
                        var rhythm = style.DashSequence ?? new[] { style.Dash, style.Gap };
                        double cycle = rhythm.Sum();
                        double local = d - Math.Floor(d / cycle) * cycle;
                        double baseAt = d - local;
                        for (int k = 0; k < rhythm.Length; k += 2)
                        {
                            if (local <= rhythm[k] + rhythm[k + 1]) { d = baseAt + rhythm[k] + rhythm[k + 1] / 2; break; }
                            local -= rhythm[k] + rhythm[k + 1]; baseAt += rhythm[k] + rhythm[k + 1];
                        }
                    }
                    if (d < 0 || d > trace.Length) continue;
                    var origin = trace.At(d); var normal = trace.At(d, 1);
                    double nx = normal.X - origin.X, ny = normal.Y - origin.Y;
                    foreach (var glyph in Glyph(symbol.Mark))
                        lines.Add(Contours.Line(glyph.Select(p => P(origin.X + ny * p.X * symbol.Width + nx * (symbol.Offset + p.Y * symbol.Height),
                            origin.Y - nx * p.X * symbol.Width + ny * (symbol.Offset + p.Y * symbol.Height)))));
                }
            }
            return lines;
        }

        public static int Samples(double length, double resolution)
        {
            double count = Math.Ceiling(length / resolution);
            if (count > 100000) throw new ArgumentException("Слишком много узлов. Увеличьте шаг.");
            return Math.Max(1, (int)count);
        }
    }

    public class BedOptions
    {
        public double Spacing = 3, Horizontal = 1.7, Start = 0.5, SymbolSize = 0.65, Multiplier = 1;
        public int Rows, Frequency = 1, Seed = 17;
        public bool Alternate = true, Random, Beds = true;
        public Mark Main = Mark.Bar, Extra = Mark.None;
        public Coordinate[][] MainGeometry, ExtraGeometry;
        public double Angle;
        public bool VarySize, VaryAngle;
    }

    public static class Beds
    {
        public static List<LineString> Draw(Geometry area, LineString[] paths, BedOptions o)
        {
            if (o.Spacing <= 0 || o.Horizontal <= 0 || o.Multiplier <= 0 || o.Frequency < 1)
                throw new ArgumentException("Проверьте шаг и частоту.");
            var box = area.EnvelopeInternal;
            bool between = paths.Length == 2 && paths.All(p => !p.IsClosed);
            var a = new Trace(between ? paths[0] : Contours.Line(new[] { new Coordinate(box.MinX, box.MaxY), new Coordinate(box.MaxX, box.MaxY) }));
            var b = new Trace(between ? Contours.Align(paths[0], paths[1]) : Contours.Line(new[] { new Coordinate(box.MinX, box.MinY), new Coordinate(box.MaxX, box.MinY) }));
            double thickness = Enumerable.Range(0, 17).Average(i => a.At(a.Length * i / 16).Distance(b.At(b.Length * i / 16)));
            int rows = Math.Max(1, (int)Math.Round((o.Rows > 0 ? o.Rows : thickness / o.Spacing) * o.Multiplier));
            if (rows > 2000) throw new ArgumentException("Увеличьте расстояние между прослоями.");
            double bed = thickness / rows;
            if (bed < 0.001) throw new ArgumentException("Слишком малая мощность слоя.");
            int samples = Linework.Samples(Math.Max(a.Length, b.Length), Math.Max(.2, Math.Min(2, bed / 2)));
            if ((long)rows * samples > 500000 || rows * Math.Max(a.Length, b.Length) / (bed * o.Horizontal) > 50000)
                throw new ArgumentException("Увеличьте шаг или разделите участок.");
            var output = new List<LineString>();
            var random = new Random(o.Seed);
            Func<double, LineString> level = r => Contours.Line(Enumerable.Range(0, samples + 1)
                .Select(i => Contours.Mix(a.At((double)i / samples * a.Length), b.At((double)i / samples * b.Length), r)));
            var main = o.MainGeometry ?? Linework.Glyph(o.Main).ToArray();
            var extraShapes = o.ExtraGeometry ?? Linework.Glyph(o.Extra).ToArray();
            for (int row = 0; row < rows; row++)
            {
                if (o.Beds && row > 0) output.Add(level((double)row / rows));
                var mid = new Trace(level((row + .5) / rows));
                double step = bed * o.Horizontal;
                double phase = (o.Start + (o.Alternate && row % 2 == 1 ? .5 : 0)) * step;
                int column = 0;
                for (double d = phase % step; d < mid.Length; d += step, column++)
                {
                    foreach (var glyph in main)
                        output.Add(Contours.Line(glyph.Select(p => mid.At(d + p.X * bed, (p.Y - .5) * bed))));
                    bool extra = o.Random ? random.Next(o.Frequency) == 0 : column % o.Frequency == 0;
                    if (extra && extraShapes.Length > 0)
                    {
                        double angle = (o.Angle + (o.VaryAngle ? random.NextDouble() * 360 : 0)) * Math.PI / 180;
                        double cs = Math.Cos(angle), sn = Math.Sin(angle);
                        double size = bed * o.SymbolSize * (o.VarySize ? .65 + .7 * random.NextDouble() : 1);
                        foreach (var glyph in extraShapes)
                            output.Add(Contours.Line(glyph.Select(p => mid.At(d + step / 2 + (cs * p.X - sn * (p.Y - .5)) * size,
                                (sn * p.X + cs * (p.Y - .5)) * size))));
                    }
                }
            }
            if (output.Count == 0) return output;
            var clipped = area.Intersection(Contours.Factory.CreateMultiLineString(output.ToArray()));
            return Contours.Lines(clipped).Where(p => p.Length > .00001).ToList();
        }
    }
}

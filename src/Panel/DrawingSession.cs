using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Xml.Linq;
using NetTopologySuite.Geometries;
using System.Globalization;

namespace StrataDraw
{
    internal sealed partial class DrawingSession
    {
        public readonly dynamic App, Doc, Layer;
        public readonly object[] Selected;
        public readonly Coordinate Click;
        private DrawingSession(object app, object doc, object layer, object[] selected, Coordinate click)
        { App = app; Doc = doc; Layer = layer; Selected = selected; Click = click; }

        internal static object[] Items(dynamic collection)
        {
            int n = collection.Count;
            var result = new object[n];
            for (int i = 0; i < n; i++) result[i] = collection[i + 1];
            return result;
        }

        public static void Run(object application, bool pick, string outputLayer, Action<DrawingSession> action)
        {
            dynamic app = application;
            if (app.Documents.Count == 0) throw new ArgumentException("Откройте документ CorelDRAW.");
            dynamic doc = app.ActiveDocument, original = app.ActiveLayer;
            int unit = (int)doc.Unit;
            object[] selected = Items(app.ActiveSelectionRange);
            dynamic staging = null, createdLayer = null;
            bool started = false, committed = false;
            object[] generated = new object[0];
            try
            {
                doc.Unit = 3; // cdrMillimeter
                Coordinate click = null;
                if (pick)
                {
                    double x = 0, y = 0; int shift = 0;
                    if (doc.GetUserClick(out x, out y, out shift, 60, false, 0) != 0)
                        throw new OperationCanceledException("Выбор точки отменён.");
                    click = new Coordinate(x, y);
                }
                doc.BeginCommandGroup("Strata Draw"); started = true;
                dynamic destination = original;
                if (!string.IsNullOrWhiteSpace(outputLayer))
                {
                    destination = null;
                    foreach (dynamic l in Items(doc.ActivePage.Layers))
                        if ((string)l.Name == outputLayer) { destination = l; break; }
                    if (destination == null) destination = createdLayer = doc.ActivePage.CreateLayer(outputLayer);
                }
                if (!destination.Editable) throw new ArgumentException("Выбранный слой заблокирован.");
                staging = doc.ActivePage.CreateLayer("Strata Draw " + Guid.NewGuid().ToString("N").Substring(0, 8));
                staging.Activate();
                var session = new DrawingSession(app, doc, staging, selected, click);
                action(session);
                if (staging.Shapes.Count > 0)
                {
                    generated = Items(staging.Shapes);
                    dynamic items = staging.Shapes.All();
                    items.MoveToLayer(destination);
                    items.CreateSelection();
                }
                session.AfterCommit?.Invoke();
                createdLayer = null; committed = true;
            }
            finally
            {
                try
                {
                    if (!committed)
                    {
                        foreach (dynamic shape in generated) shape.Delete();
                        if (started)
                        {
                            doc.ClearSelection();
                            foreach (dynamic shape in selected) shape.AddToSelection();
                        }
                    }
                    original.Activate();
                    if (staging != null) staging.Delete();
                    if (createdLayer != null && createdLayer.Shapes.Count == 0) createdLayer.Delete();
                }
                finally
                {
                    try { if (started) doc.EndCommandGroup(); }
                    finally { doc.Unit = unit; }
                }
            }
        }

        private static void Bezier(List<Coordinate> line, Coordinate a, Coordinate b, Coordinate c, Coordinate d, int depth)
        {
            // Subdivide until both handles are within 0.02 mm of the chord segment.
            var chord = new LineSegment(a, d);
            if (depth >= 15 || Math.Max(chord.Distance(b), chord.Distance(c)) < .02)
            { line.Add(d); return; }
            var ab = Contours.Mix(a, b, .5); var bc = Contours.Mix(b, c, .5); var cd = Contours.Mix(c, d, .5);
            var p = Contours.Mix(ab, bc, .5); var q = Contours.Mix(bc, cd, .5); var mid = Contours.Mix(p, q, .5);
            Bezier(line, a, ab, p, mid, depth + 1); Bezier(line, mid, q, cd, d, depth + 1);
        }
        private static List<LineString> Paths(object item)
        {
            dynamic shape = item;
            var result = new List<LineString>();
            if ((int)shape.Type == 7) // cdrGroupShape
            {
                foreach (object child in Items(shape.Shapes)) result.AddRange(Paths(child));
                return result;
            }
            dynamic curve = shape.DisplayCurve;
            if (curve == null) return result;
            foreach (dynamic sub in Items(curve.SubPaths))
            {
                var points = new List<Coordinate>();
                foreach (dynamic seg in Items(sub.Segments))
                {
                    var a = new Coordinate((double)seg.StartNode.PositionX, (double)seg.StartNode.PositionY);
                    var b = new Coordinate((double)seg.EndNode.PositionX, (double)seg.EndNode.PositionY);
                    if (points.Count == 0) points.Add(a);
                    if ((int)seg.Type == 0) points.Add(b);
                    else Bezier(points, a, new Coordinate((double)seg.StartingControlPointX, (double)seg.StartingControlPointY),
                        new Coordinate((double)seg.EndingControlPointX, (double)seg.EndingControlPointY), b, 0);
                }
                if (points.Count < 2) continue;
                if (sub.Closed && !points[0].Equals2D(points.Last())) points.Add(points[0]);
                var path = Contours.Line(points);
                if (path.Length > 0) result.Add(path);
            }
            return result;
        }

        public Coordinate[][] ReadGlyph(string filename)
        {
            if (string.IsNullOrWhiteSpace(filename)) return null;
            dynamic mark = Import(filename);
            try
            {
                var paths = Paths((object)mark);
                var envelope = new Envelope();
                foreach (var path in paths) envelope.ExpandToInclude(path.EnvelopeInternal);
                double size = Math.Max(envelope.Width, envelope.Height);
                if (size <= 0) throw new ArgumentException("В файле знака нет кривых.");
                return paths.Select(path => path.Coordinates.Select(p => new Coordinate(
                    (p.X - envelope.Centre.X) / size, .5 + (p.Y - envelope.Centre.Y) / size)).ToArray()).ToArray();
            }
            finally { mark.Delete(); }
        }
        public LineString[] SelectionPaths() => Selected.SelectMany(Paths).ToArray();
        public Geometry Area()
        {
            if (Click == null) return Contours.Region(SelectionPaths());
            var curves = new List<LineString>();
            foreach (dynamic s in Items(Doc.ActivePage.Shapes))
            {
                if (!s.Visible || !s.Layer.Visible) continue;
                int type = (int)s.Type;
                if (type == 1 || type == 2 || type == 3 || type == 7 || type == 4 || type == 26) curves.AddRange(Paths(s));
            }
            return Contours.Face(curves.ToArray(), Click);
        }

        public dynamic Color(string hex)
        {
            if (!System.Text.RegularExpressions.Regex.IsMatch(hex ?? "", "^#[A-Fa-f0-9]{6}$"))
                throw new ArgumentException("Укажите цвет в формате #RRGGBB.");
            return App.CreateRGBColor(Convert.ToInt32(hex.Substring(1, 2), 16),
                Convert.ToInt32(hex.Substring(3, 2), 16), Convert.ToInt32(hex.Substring(5, 2), 16));
        }
        private static void Append(dynamic curve, LineString line, bool closed)
        {
            var points = line.Coordinates;
            dynamic sub = curve.CreateSubPath(points[0].X, points[0].Y);
            int count = closed && points[0].Equals2D(points.Last()) ? points.Length - 1 : points.Length;
            for (int i = 1; i < count; i++) sub.AppendLineSegment(points[i].X, points[i].Y);
            if (closed) sub.Closed = true;
        }

        public dynamic Boundary(Geometry area)
        {
            dynamic curve = Doc.CreateCurve();
            foreach (LineString ring in Contours.Lines(area.Boundary)) Append(curve, ring, true);
            dynamic shape = Layer.CreateCurve(curve);
            shape.Outline.SetNoOutline();
            return shape;
        }
        public dynamic Strokes(IEnumerable<LineString> lines, string color, double width)
        {
            dynamic curve = Doc.CreateCurve();
            int count = 0;
            foreach (var line in lines) { Append(curve, line, line.IsClosed); count++; }
            if (count == 0) throw new ArgumentException("В пределах области нет элементов. Уменьшите шаг.");
            dynamic result = Layer.CreateCurve(curve);
            result.Fill.ApplyNoFill(); result.Outline.Width = width;
            result.Outline.Color.CopyAssign(Color(color));
            return result;
        }
        public dynamic Import(string filename)
        {
            Doc.ClearSelection();
            dynamic filter = Layer.ImportEx(filename);
            filter.Finish();
            dynamic range = App.ActiveSelectionRange;
            if (range.Count == 0) throw new IOException("CorelDRAW не выбрал импортированные объекты.");
            return range.Count == 1 ? range[1] : range.Group();
        }
        public dynamic Svg(XElement image)
        {
            string path = Path.Combine(Path.GetTempPath(), Guid.NewGuid() + ".svg");
            try { image.Save(path); return Import(path); }
            finally { File.Delete(path); }
        }
        private dynamic TileCopies(Geometry area, string asset, double width, double angle)
        {
            // Fallback for Corel installations where the PAT export filter is unavailable.
            dynamic original = Import(asset);
            if (width <= 0) width = (double)original.SizeWidth;
            double height = width * (double)original.SizeHeight / (double)original.SizeWidth;
            original.SetSize(width, height);
            var box = area.EnvelopeInternal;
            double radians = angle * Math.PI / 180, c = Math.Cos(radians), q = Math.Sin(radians);
            double spanX = Math.Abs(c) * box.Width + Math.Abs(q) * box.Height;
            double spanY = Math.Abs(q) * box.Width + Math.Abs(c) * box.Height;
            int nx = Math.Max(1, (int)Math.Ceiling(spanX / width)), ny = Math.Max(1, (int)Math.Ceiling(spanY / height));
            if ((long)nx * ny > 10000) throw new ArgumentException("Для этой области нужно больше 10 000 плиток. Увеличьте размер плитки.");
            for (int j = 0; j < ny; j++)
                for (int i = 0; i < nx; i++)
                {
                    dynamic item = (i == 0 && j == 0) ? original : original.Duplicate(0, 0);
                    double x = (i - (nx - 1) * .5) * width, y = (j - (ny - 1) * .5) * height;
                    item.CenterX = box.Centre.X + x; item.CenterY = box.Centre.Y + y;
                }
            dynamic mosaic = Layer.Shapes.Count == 1 ? original : Layer.Shapes.All().Group();
            if (angle != 0) mosaic.Rotate(angle);
            dynamic boundary = Boundary(area);
            boundary.Fill.ApplyNoFill();
            mosaic.AddToPowerClip(boundary, 0);
            boundary.Name = "Strata Draw · плитки"; return boundary;
        }

        public dynamic Vector(Geometry area, string asset, double width, double angle)
        {
            string pat = asset;
            bool convert = !asset.EndsWith(".pat", StringComparison.OrdinalIgnoreCase);
            double ratio = 1;
            if (convert) pat = Path.Combine(Path.GetTempPath(), Guid.NewGuid() + ".pat");
            try
            {
                if (convert)
                {
                    dynamic tile = Import(asset);
                    ratio = (double)tile.SizeHeight / (double)tile.SizeWidth;
                    if (width <= 0) width = (double)tile.SizeWidth;
                    tile.CreateSelection();
                    Doc.Export(pat, 1801, 2); // cdrPAT, cdrSelection
                    tile.Delete();
                }
                dynamic target = Boundary(area);
                dynamic pattern = target.Fill.ApplyPatternFill(1, pat);
                if (!convert) { ratio = (double)pattern.TileHeight / (double)pattern.TileWidth; if (width <= 0) width = (double)pattern.TileWidth; }
                pattern.TileWidth = width; pattern.TileHeight = width * ratio;
                pattern.RotationAngle = angle;
                target.Name = "Strata Draw · узор"; return target;
            }
            catch (System.Runtime.InteropServices.COMException) when (convert)
            {
                // This layer is private to this single operation.
                if (Layer.Shapes.Count > 0) Layer.Shapes.All().Delete();
                return TileCopies(area, asset, width, angle);
            }
            finally { if (convert && File.Exists(pat)) File.Delete(pat); }
        }
        public dynamic OneCurve()
        {
            dynamic shape = Click == null ? (Selected.Length == 1 ? Selected[0] : null) :
                Doc.ActivePage.FindShapeAtPoint(Click.X, Click.Y, true);
            if (shape == null) throw new ArgumentException("Выберите одну кривую.");
            return shape;
        }
        public void Decorate(LineStyle style, string caption = "Линия")
        {
            dynamic source = OneCurve();
            List<LineString> paths = Paths((object)source);
            Strokes(paths.SelectMany(p => Linework.Draw(p, style)), style.Color, style.Width);
            if (style.ParallelEnabled || style.Parallel != 0)
            {
                var parallel = new List<LineString>();
                foreach (var path in paths)
                {
                    var t = new Trace(style.Reverse ? (LineString)path.Reverse() : path);
                    int n = Linework.Samples(t.Length, .3);
                    parallel.Add(Contours.Line(Enumerable.Range(0, n + 1).Select(i => t.At(t.Length * i / n, style.Parallel))));
                }
                Strokes(parallel, style.Color, style.ParallelWidth);
            }
            dynamic result = Layer.Shapes.Count == 1 ? Layer.Shapes[1] : Layer.Shapes.All().Group();
            result.Name = "Strata Draw · линия #" + source.StaticID;
            // Keep the original curve and its exact Bezier handles in the document.
            Tag((object)result, "Линии", caption);
            AfterCommit = () => source.Visible = false;
        }
        public Action AfterCommit;
        public void Restore()
        {
            dynamic result = OneCurve();
            string name = (string)result.Name;
            const string prefix = "Strata Draw · линия #";
            if (!name.StartsWith(prefix, StringComparison.Ordinal) || !int.TryParse(name.Substring(prefix.Length), out int id))
                throw new ArgumentException("Выберите линию, оформленную в Strata Draw.");
            dynamic source = Doc.FindShape("", 0, id, true);
            if (source == null || source.Visible) throw new ArgumentException("Исходная скрытая кривая не найдена.");
            source.Visible = true; result.Delete(); source.CreateSelection();
        }
    }
}

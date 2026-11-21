using System;
using System.Collections.Generic;
using System.Linq;
using NetTopologySuite.Geometries;
using NetTopologySuite.Operation.Polygonize;
using NetTopologySuite.Operation.Union;

namespace StrataDraw
{
    public static class Contours
    {
        public static readonly GeometryFactory Factory = new GeometryFactory();
        public static Coordinate Mix(Coordinate a, Coordinate b, double t) =>
            new Coordinate(a.X + (b.X - a.X) * t, a.Y + (b.Y - a.Y) * t);

        public static LineString Line(IEnumerable<Coordinate> points) =>
            Factory.CreateLineString(points.ToArray());

        public static LineString Align(LineString top, LineString bottom)
        {
            var a = top.StartPoint.Coordinate;
            var b = top.EndPoint.Coordinate;
            var c = bottom.StartPoint.Coordinate;
            var d = bottom.EndPoint.Coordinate;
            return a.Distance(d) + b.Distance(c) < a.Distance(c) + b.Distance(d)
                ? (LineString)bottom.Reverse() : bottom;
        }

        private static Polygon Ring(IEnumerable<Coordinate> coordinates)
        {
            var points = coordinates.ToList();
            if (!points[0].Equals2D(points[points.Count - 1])) points.Add(points[0]);
            if (points.Count < 4) throw new ArgumentException("Для области нужны три разные вершины.");
            var polygon = Factory.CreatePolygon(points.ToArray());
            if (!polygon.IsValid || polygon.Area <= 0)
                throw new ArgumentException("Граница пересекает себя или не охватывает площадь.");
            return polygon;
        }

        public static Geometry Region(LineString[] paths)
        {
            if (paths.Length == 0) throw new ArgumentException("Выберите контур или две границы слоя.");
            if (paths.Length == 2 && paths.All(p => !p.IsClosed))
            {
                var other = Align(paths[0], paths[1]);
                return Ring(paths[0].Coordinates.Concat(other.Coordinates.Reverse()));
            }
            if (paths.Length > 1 && paths.Any(p => !p.IsClosed))
                throw new ArgumentException("Выберите две открытые границы или замкнутые контуры.");
            Geometry area = Ring(paths[0].Coordinates);
            foreach (var path in paths.Skip(1)) area = area.SymmetricDifference(Ring(path.Coordinates));
            if (area.IsEmpty) throw new ArgumentException("Область пуста.");
            return area;
        }

        public static Geometry Face(LineString[] paths, Coordinate click)
        {
            if (paths.Length == 0) throw new ArgumentException("В точке нет ограниченной области.");
            var graph = new Polygonizer();
            graph.Add(UnaryUnionOp.Union(paths.Cast<Geometry>().ToArray()));
            var point = Factory.CreatePoint(click);
            return graph.GetPolygons().Cast<Polygon>().Where(p => p.Contains(point))
                .OrderBy(p => p.Area).FirstOrDefault()
                ?? throw new ArgumentException("Щёлкните внутри области, окружённой кривыми.");
        }

        public static IEnumerable<LineString> Lines(Geometry g)
        {
            if (g.IsEmpty) yield break;
            if (g is LineString l) { yield return l; yield break; }
            if (g is GeometryCollection c)
                foreach (Geometry sub in c.Geometries)
                    foreach (var line in Lines(sub)) yield return line;
        }
    }

    // An arc-length index is reused for every mark on a horizon or decorative line.
    public sealed class Trace
    {
        private readonly Coordinate[] points;
        private readonly double[] distance;
        public double Length => distance[distance.Length - 1];
        public Trace(LineString line)
        {
            points = line.Coordinates;
            distance = new double[points.Length];
            for (int i = 1; i < points.Length; i++)
                distance[i] = distance[i - 1] + points[i].Distance(points[i - 1]);
            if (Length <= 0) throw new ArgumentException("Нулевая длина кривой.");
        }
        public Coordinate At(double along, double normal = 0)
        {
            along = Math.Max(0, Math.Min(Length, along));
            int i = Array.BinarySearch(distance, along);
            i = Math.Max(1, Math.Min(points.Length - 1, i < 0 ? ~i : i));
            while (i < points.Length - 1 && distance[i] == distance[i - 1]) i++;
            double length = distance[i] - distance[i - 1];
            if (length == 0) return points[i].Copy();
            var a = points[i - 1]; var b = points[i];
            var p = Contours.Mix(a, b, (along - distance[i - 1]) / length);
            return new Coordinate(p.X - normal * (b.Y - a.Y) / length,
                                  p.Y + normal * (b.X - a.X) / length);
        }

        public IEnumerable<Coordinate> Slice(double start, double end)
        {
            yield return At(start);
            int i = Array.BinarySearch(distance, start);
            for (i = i < 0 ? ~i : i + 1; i < points.Length && distance[i] < end; i++)
                yield return points[i];
            yield return At(end);
        }
    }
}

using System;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Xml.Linq;
using StrataDraw;

internal static class Program
{
    private static void Check(bool ok, string message)
    {
        if (!ok) throw new InvalidDataException(message);
    }

    private static void Main(string[] args)
    {
        Registration.Check();
        Functional.Run(args[0]);
        CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo("ru-RU");
        var folder = Directory.CreateDirectory(args[0]);
        foreach (Rock rock in Enum.GetValues<Rock>())
        {
            int previous = int.MaxValue;
            for (int spacing = 2; spacing <= 8; spacing++)
            {
                var svg = Swatch.Draw(rock, spacing);
                var ns = svg.Name.Namespace;
                Check((string)svg.Attribute("width") == "48mm" &&
                    (string)svg.Attribute("height") == "24mm", "Size");
                var marks = svg.Elements().Skip(1).ToArray();
                Check(marks.Length > 1 && marks.Length <= previous, "Density");
                foreach (var mark in marks)
                {
                    Check(mark.Name == ns + (rock == Rock.Sand ? "circle" : "line"), "Geometry");
                    foreach (var coordinate in mark.Attributes().Where(a =>
                        new[] { "cx", "cy", "x1", "x2", "y1", "y2" }.Contains(a.Name.LocalName)))
                    {
                        double n = (double)coordinate;
                        Check(n > 0 && n < (coordinate.Name.LocalName.Contains("x") ? 48 : 24), "Bounds");
                    }
                }
                previous = marks.Length;
                if (spacing == 4) svg.Save(Path.Combine(folder.FullName, rock + ".svg"));
            }
        }
        foreach (int bad in new[] { 1, 9 })
        {
            try { Swatch.Draw(Rock.Sand, bad); }
            catch (ArgumentOutOfRangeException) { continue; }
            throw new Exception("Accepted invalid spacing");
        }
        Console.WriteLine("Passed 21 swatch configurations and both out-of-range checks.");
    }
}

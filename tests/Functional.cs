using System;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Xml.Linq;
using NetTopologySuite.Geometries;
using StrataDraw;

internal static class Functional
{
    static void Check(bool ok, string what) { if (!ok) throw new Exception(what); }
    static LineString L(params double[] xy) => Contours.Line(Enumerable.Range(0, xy.Length / 2)
        .Select(i => new Coordinate(xy[2 * i], xy[2 * i + 1])));
    static void Reject(Action op)
    {
        try { op(); } catch (ArgumentException) { return; } catch (FormatException) { return; }
        throw new Exception("Invalid input accepted.");
    }
    public static void Run(string output)
    {
        var edge = L(0, 0, 40, 0, 40, 20, 0, 20, 0, 0);
        var hole = L(10, 5, 20, 5, 20, 15, 10, 15, 10, 5);
        var area = Contours.Region(new[] { edge, hole });
        Check(Math.Abs(area.Area - 700) < 1e-8 && !area.Contains(Contours.Factory.CreatePoint(new Coordinate(15, 10))), "Hole");
        Check(Contours.Region(new[] { L(40, 20, 15, 18, 0, 20), L(0, 0, 40, 0) }).Area == 760, "Opposite horizon directions");
        var net = new[] { edge, hole, L(27, -6, 27, 30) };
        Check(Contours.Face(net, new Coordinate(35, 12)).Area == 260, "Noded intersection");
        Check(Contours.Face(net, new Coordinate(4, 12)).Area == 440, "Face with interior hole");
        Reject(() => Contours.Face(net, new Coordinate(80, 80)));
        Reject(() => Contours.Region(new[] { L(0, 0, 10, 10, 0, 10, 10, 0, 0, 0) }));
        var style = new BedOptions { Rows = 5, Main = Mark.Square, Extra = Mark.Diamond, Random = true, Frequency = 2 };
        var beds = Beds.Draw(area, new[] { edge, hole }, style);
        Check(beds.Count > 5 && beds.All(p => area.Covers(p)), "Beds respect holes and clipping");
        var horizons = new[] { L(0, 0, 20, 5, 40, 0), L(40, 12, 20, 18, 0, 12) };
        var curved = Contours.Region(horizons);
        Check(Beds.Draw(curved, horizons, style).All(x => x.Difference(curved).Length < 1e-7), "Curved horizons");
        var source = L(0, 0, 10, 0, 10, 20);
        foreach (var form in Enum.GetValues<LineForm>())
            foreach (var glyph in Enum.GetValues<Mark>())
            {
                var parts = Linework.Draw(source, new LineStyle { Form = form, Marks = new[] { glyph }, Reverse = true });
                Check(parts.All(p => p.Length > 0 && p.Coordinates.All(c => double.IsFinite(c.X) && double.IsFinite(c.Y))), "Line " + form + "/" + glyph);
            }
        var dashed = Linework.Draw(L(0, 0, 13, 0), new LineStyle { Form = LineForm.Dash, Dash = 3, Gap = 2 });
        Check(dashed.Count == 3 && dashed.Sum(p => p.Length) == 9, "Dash lengths");
        string[] log ={"~V","VERS. 2.0","WRAP. YES","~W","WELL. Field 7","NULL. -999.25","~C","DEPT.FT : depth","GR.API : gamma","RHOB.G/C3 : density","~A",
            "104 1","2","103 -999.25","3","102 5 4","101 6 5"};
        var las = Survey.Las(log);
        Check(las.Title == "Field 7" && las.DepthUnit == .3048 && las.Rows[1][1] == null && las.Rows.Count == 4, "LAS units/wrapped/nulls");
        var chart = SectionPlot.Draw(las, true, new PlotOptions());
        var ns = chart.Name.Namespace;
        Check(chart.Elements(ns + "circle").Count() == 1 &&
            chart.Elements(ns + "path").Count(p => (string)p.Attribute("stroke") == "#175779") == 1, "LAS gap preservation");
        var overlay = SectionPlot.Draw(las, true, new PlotOptions { Tracks = "1;1;1;10;log-rev;#a00000;.3;1\n2;1;;;;#000099", Triple = true, Simplify = .1 });
        Check(overlay.Elements(ns + "path").Any(p => (string)p.Attribute("fill") == "#a00000") &&
            overlay.Elements(ns + "rect").Count() == 3, "Shared tracks, log, fill and triple frame");
        Reject(() => Survey.Las(log.Append("100")));
        var table = Survey.Horizons(new[] { "skip", "X;Пласт 1;Пласт 2", "0;10,5;12", "10;12;13", "20;;15" }, true, 1);
        Check(table.Rows[0][1] == 10.5 && table.Rows[2][1] == null, "CSV semicolon/comma and gaps");
        var section = SectionPlot.Draw(table, false, new PlotOptions { ScaleX = 1000, ScaleY = 500 });
        Directory.CreateDirectory(output); section.Save(Path.Combine(output, "section.svg")); chart.Save(Path.Combine(output, "las.svg"));
        int n = 0;
        using var prev = ZipFile.OpenRead("data/previews.zip");
        foreach (string file in new[] { "data/fgdc.zip", "data/symbols.zip", "data/basic.zip", "data/sdar.zip", "data/equinor.zip" })
        {
            using var z = ZipFile.OpenRead(file);
            foreach (var e in z.Entries)
            {
                using var input = e.Open();
                Check(XElement.Load(input).Name == ns + "svg" && prev.GetEntry(e.FullName + ".png") != null, "Vector " + e.FullName); n++;
            }
        }
        var rocks = Library.RockPatterns("data");
        Check(rocks.Count == 214 && rocks.Select(r => r.Key).Distinct().Count() == rocks.Count, "Rock catalog");
        foreach (var rock in rocks)
        {
            Check(rock.NativeWidth > 0 && !string.IsNullOrWhiteSpace(rock.Name), rock.Name);
            Library.WithFile(rock, path => Check(XElement.Load(path).Name == ns + "svg", rock.Key));
        }
        Check(rocks.Any(Library.RockSearch("лесс 684")) && rocks.Any(Library.RockSearch("кварцев песчаник")) &&
              rocks.Any(Library.RockSearch("туф 92015")), "Rock search by name, modifier and alternate code");
        var allTiles = Library.Tiles("data");
        Check(rocks.All(r => allTiles.Any(t => t.Key == r.Key && t.Location == r.Location && t.NativeWidth == r.NativeWidth)), "Rock catalog references");
        Check(n == 1285 && allTiles.Count == 569 && Library.Symbols("data").Count == 716, "Catalogs");
        var lineCatalog = File.ReadAllLines("data/lines.tsv");
        Check(lineCatalog.Length == 43, "FGDC line catalog");
        foreach (string row in lineCatalog)
        {
            string[] f = row.Split('\t');
            var spec = new LineStyle { Form = f[3] == "-" ? LineForm.Solid : LineForm.Dash,
                Width = LineSymbol.ReadSize(f[2]), Color = f[1],
                DashSequence = f[3] == "-" ? null : f[3].Split(';').Select(LineSymbol.ReadSize).ToArray() };
            Check(Linework.Draw(source, spec).Count > 0, f[0]);
        }
        var ages = Library.Ages("data");
        Check(ages.Count == 171 && ages.Any(x => x.Name.Contains("Юра") && x.Color == "#34B2C9"), "Timescale");
        Console.WriteLine("Passed geological geometry, 52 line/mark combinations, LAS, horizons, 1285 vectors with previews and 171 ages.");
    }
}

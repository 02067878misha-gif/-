using System;
using System.IO;
using System.Linq;
using NetTopologySuite.Geometries;

namespace StrataDraw
{
    // Optional Windows check uses the real application, a new document and the same commands as the panel.
    public static class HostVerification
    {
        public static void Run(object application, string addonDirectory)
        {
            dynamic app = application;
            dynamic doc = app.CreateDocument();
            doc.Unit = 3;
            dynamic layer = app.ActiveLayer;
            dynamic frame = layer.CreateRectangle(10, 50, 75, 20);
            frame.CreateSelection();
            DrawingSession.Run(application, false, "Strata Draw - check", s =>
            {
                var paths = s.SelectionPaths(); var area = Contours.Region(paths);
                if (Math.Abs(area.Area - 1950) > .1) throw new Exception("Incorrect document coordinates.");
                dynamic strokes = s.Strokes(Beds.Draw(area, paths, new BedOptions()), "#273842", .2);
                s.Tag((object)strokes, "Прослои", "Тестовый слой");
            });
            frame.CreateSelection();
            string data = Path.Combine(addonDirectory, "data");
            DrawingSession.Run(application, false, "Strata Draw - check", s =>
            {
                var area = s.Area();
                Library.WithFile(Library.Tiles(data).First(t => t.Key == "627.svg"), path => s.Vector(area, path, 8, 10));
            });
            dynamic line = layer.CreateLineSegment(10, 60, 70, 70);
            line.CreateSelection();
            DrawingSession.Run(application, false, "Strata Draw - check", s => s.Decorate(new LineStyle { Form = LineForm.Wave, Marks = new[] { Mark.Triangle } }));
            if (line.Visible) throw new Exception("Original line is still visible.");
            DrawingSession.Run(application, false, "", s => s.Restore());
            if (!line.Visible) throw new Exception("Original line was not restored.");
            DrawingSession.Run(application, false, "Strata Draw - check", s =>
            {
                Library.WithFile(Library.Symbols(data).First(), path => s.Import(path));
            });
            var las = Survey.Las(new[] { "~Curve", "DEPT.M", "GR.API", "~A", "0 10", "1 12", "2 11" });
            DrawingSession.Run(application, false, "Strata Draw - check", s => s.Svg(SectionPlot.Draw(las, true, new PlotOptions())));
            DrawingSession.Run(application, false, "Strata Draw - check", s => s.Legend(1, 14, 6, true, true, true, false, 75));
            var ui = new ToolPanel(application);
            if (ui.Content == null) throw new Exception("WPF panel failed to initialize.");
        }
    }
}

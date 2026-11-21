using System;
using System.Globalization;
using System.Xml.Linq;

namespace StrataDraw
{
    public enum Rock { Sand, Shale, Limestone }

    public static class Swatch
    {
        private static readonly XNamespace Svg = "http://www.w3.org/2000/svg";
        private static string Number(double value) =>
            value.ToString("0.###", CultureInfo.InvariantCulture);

        // Keep every mark inside the swatch, including half its stroke width.
        private static XElement Line(double x1, double y1, double x2, double y2) =>
            new XElement(Svg + "line", new XAttribute("x1", Number(x1)),
                new XAttribute("y1", Number(y1)), new XAttribute("x2", Number(x2)),
                new XAttribute("y2", Number(y2)), new XAttribute("stroke", "#223942"),
                new XAttribute("stroke-width", "0.22"));

        public static XElement Draw(Rock rock, int spacing)
        {
            if (spacing < 2 || spacing > 8)
                throw new ArgumentOutOfRangeException(nameof(spacing));
            if (!Enum.IsDefined(typeof(Rock), rock))
                throw new ArgumentOutOfRangeException(nameof(rock));

            const int width = 48, height = 24;
            var root = new XElement(Svg + "svg", new XAttribute("width", "48mm"),
                new XAttribute("height", "24mm"), new XAttribute("viewBox", "0 0 48 24"));
            root.Add(new XElement(Svg + "rect", new XAttribute("width", width),
                new XAttribute("height", height), new XAttribute("fill", "#ffffff")));

            for (int row = 0, y = 1; y < height - 1; row++, y += spacing)
            {
                if (rock == Rock.Limestone)
                    root.Add(Line(1, y, width - 1, y));
                double offset = (row % 2) * spacing / 2.0;
                for (double x = 1 + offset; x < width - 1; x += spacing * 2)
                {
                    switch (rock)
                    {
                        case Rock.Sand:
                            root.Add(new XElement(Svg + "circle",
                                new XAttribute("cx", Number(x)), new XAttribute("cy", y),
                                new XAttribute("r", "0.35"), new XAttribute("fill", "#223942")));
                            break;
                        case Rock.Shale:
                            root.Add(Line(x, y, Math.Min(x + spacing * 1.4, width - 1), y));
                            break;
                        case Rock.Limestone:
                            root.Add(Line(x, y, x, Math.Min(y + spacing, height - 1)));
                            break;
                    }
                }
            }
            return root;
        }
    }
}

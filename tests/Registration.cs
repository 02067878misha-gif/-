using System;
using System.IO;
using System.Linq;
using System.Xml.Linq;
using System.Xml.Xsl;

internal static class Registration
{
    public static void Check()
    {
        // A minimal Corel UI tree exercises both transformations and their references.
        var ui = XDocument.Parse("""
            <uiConfig><items/><dockers/><commandBars>
            <commandBarData guid="cdb9ea9c-223e-4865-97a6-31c007c69674"><menu/></commandBarData>
            </commandBars></uiConfig>
            """);
        foreach (var file in new[] { "AppUI", "UserUI" })
        {
            var transform = new XslCompiledTransform();
            transform.Load(Path.Combine("addon", file + ".xslt"));
            var result = new XDocument();
            using (var output = result.CreateWriter())
            using (var input = ui.CreateReader())
                transform.Transform(input, output);
            ui = result;
        }
        XElement panel = ui.Descendants("dockerData").Single();
        XElement host = ui.Descendants("itemData").Single(x => (string)x.Attribute("type") == "wpfhost");
        string toggleId = (string)ui.Descendants("menu").Single().Element("item").Attribute("guidRef");
        XElement toggle = ui.Descendants("itemData").Single(x => (string)x.Attribute("guid") == toggleId);
        if ((string)toggle.Attribute("check") != $"*Docker('{panel.Attribute("guid").Value}')" ||
            (string)panel.Descendants("item").Single().Attribute("guidRef") != (string)host.Attribute("guid") ||
            (string)host.Attribute("hostedType") != @"Addons\StrataDraw\StrataDraw.dll,StrataDraw.ToolPanel")
            throw new Exception("Invalid Corel command, docker or WPF host reference.");
        Console.WriteLine("Corel UI registration transforms passed on a sample configuration.");
    }
}

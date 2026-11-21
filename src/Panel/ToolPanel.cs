using System;
using System.IO;
using System.Windows;
using System.Windows.Controls;

namespace StrataDraw
{
    public sealed class ToolPanel : UserControl
    {
        private readonly dynamic application;
        private readonly ComboBox rock = new ComboBox
        {
            ItemsSource = new[] { "Песок", "Глинистый сланец", "Известняк" },
            SelectedIndex = 0
        };
        private readonly ComboBox spacing = new ComboBox
        {
            ItemsSource = new[] { 2, 3, 4, 5, 6, 7, 8 }, SelectedItem = 4
        };
        private readonly TextBlock status = new TextBlock { TextWrapping = TextWrapping.Wrap };

        public ToolPanel(object application)
        {
            this.application = application;
            var body = new StackPanel { Margin = new Thickness(12) };
            body.Children.Add(new Label { Content = "Порода", Target = rock });
            body.Children.Add(rock);
            body.Children.Add(new Label { Content = "Шаг рядов, мм", Target = spacing });
            body.Children.Add(spacing);
            var insert = new Button { Content = "Вставить образец 48 × 24 мм",
                Margin = new Thickness(0, 14, 0, 8), Padding = new Thickness(4) };
            insert.Click += InsertSwatch;
            body.Children.Add(insert);
            body.Children.Add(status);
            Content = body;
        }

        private void InsertSwatch(object sender, RoutedEventArgs args)
        {
            string filename = Path.Combine(Path.GetTempPath(), Guid.NewGuid() + ".svg");
            try
            {
                if (application.Documents.Count == 0)
                {
                    status.Text = "Откройте документ для вставки образца.";
                    return;
                }
                Swatch.Draw((Rock)rock.SelectedIndex, (int)spacing.SelectedItem).Save(filename);
                application.ActiveLayer.Import(filename);
                status.Text = "Образец добавлен на активный слой.";
            }
            catch (Exception error)
            {
                status.Text = "Ошибка вставки: " + error.Message;
            }
            finally
            {
                try { File.Delete(filename); }
                catch (IOException) { /* The host may still hold the imported file. */ }
                catch (UnauthorizedAccessException) { /* The OS owns temporary cleanup. */ }
            }
        }
    }
}

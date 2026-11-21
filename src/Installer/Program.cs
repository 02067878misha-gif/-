using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Windows.Forms;
using Microsoft.Win32;

namespace StrataDraw.Setup
{
    internal static class Program
    {
        private const string Title = "Установка Strata Draw";
        private const string Binary = "CorelDRW.exe";

        private static bool Is2025(string file)
        {
            if (!File.Exists(file) || !Path.GetFileName(file).Equals(Binary, StringComparison.OrdinalIgnoreCase)) return false;
            var version = FileVersionInfo.GetVersionInfo(file);
            return version.FileMajorPart == 26 || version.ProductMajorPart == 26;
        }

        private static IEnumerable<string> Candidates()
        {
            using (var cls = Registry.ClassesRoot.OpenSubKey(@"CorelDRAW.Application.26\CLSID"))
            {
                if (cls?.GetValue(null) is string clsid)
                    using (var server = Registry.ClassesRoot.OpenSubKey(@"CLSID\" + clsid + @"\LocalServer32"))
                    {
                        string cmd = (server?.GetValue(null) as string ?? "").Trim();
                        int end = cmd.IndexOf(".exe", StringComparison.OrdinalIgnoreCase);
                        if (end >= 0) yield return Environment.ExpandEnvironmentVariables(cmd.Substring(0, end + 4).TrimStart('"'));
                    }
            }
            var roots = new List<string>();
            using (var uninstall = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"))
            {
                if (uninstall != null)
                    foreach (string name in uninstall.GetSubKeyNames())
                        using (var key = uninstall.OpenSubKey(name))
                            if ((key?.GetValue("DisplayName") as string ?? "").IndexOf("CorelDRAW", StringComparison.OrdinalIgnoreCase) >= 0 &&
                                key.GetValue("InstallLocation") is string folder && Directory.Exists(folder)) roots.Add(folder);
            }
            string corel = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Corel");
            if (Directory.Exists(corel)) roots.AddRange(Directory.GetDirectories(corel));
            foreach (string root in roots)
                foreach (string sub in new[] { "", "Programs64", "Programs" }) yield return Path.Combine(root, sub, Binary);
        }

        private static string ChooseCorel()
        {
            var files = Candidates().Where(Is2025).Select(Path.GetFullPath).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
            if (files.Length == 1) return files[0];
            using (var dialog = new OpenFileDialog { Title = "Укажите CorelDRW.exe от CorelDRAW 2025",
                Filter = "CorelDRAW (CorelDRW.exe)|CorelDRW.exe", CheckFileExists = true,
                InitialDirectory = files.Length > 0 ? Path.GetDirectoryName(files[0]) : Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles) })
            {
                while (dialog.ShowDialog() == DialogResult.OK)
                {
                    if (Is2025(dialog.FileName)) return dialog.FileName;
                    MessageBox.Show("Нужен CorelDRW.exe версии 26 (CorelDRAW 2025).", Title);
                }
            }
            return null;
        }

        [STAThread]
        private static int Main()
        {
            Application.EnableVisualStyles();
            try
            {
                string exe = ChooseCorel();
                if (exe == null) return 1;
                string dir = Path.GetDirectoryName(exe);
                if (MessageBox.Show("Установить панель и каталоги в папку\n" + Path.Combine(dir, "Addons", "StrataDraw") + "?",
                    Title, MessageBoxButtons.OKCancel, MessageBoxIcon.Question) != DialogResult.OK) return 1;
                while (Process.GetProcessesByName("CorelDRW").Length > 0)
                    if (MessageBox.Show("Сохраните чертежи, закройте CorelDRAW и нажмите «Повторить».",
                        Title, MessageBoxButtons.RetryCancel, MessageBoxIcon.Information) != DialogResult.Retry) return 1;
                InstallFiles.InstallEmbedded(dir);
                MessageBox.Show("Strata Draw установлен. Запустите CorelDRAW 2025, откройте документ и выберите Strata Draw в меню.", Title,
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
                return 0;
            }
            catch (Exception e)
            {
                MessageBox.Show(e.Message, Title, MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 2;
            }
        }
    }
}

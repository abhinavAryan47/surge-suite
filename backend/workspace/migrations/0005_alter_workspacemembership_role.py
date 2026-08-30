from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("workspace", "0004_workspace_context_window_limit_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="workspacemembership",
            name="role",
            field=models.CharField(
                choices=[("ADMIN", "Admin"), ("MEMBER", "Member"), ("VIEWER", "Viewer")],
                default="MEMBER",
                max_length=50,
            ),
        ),
    ]

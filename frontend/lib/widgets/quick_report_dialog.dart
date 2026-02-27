import 'package:flutter/material.dart';
import '../theme/vlvt_colors.dart';
import '../utils/error_handler.dart';
import 'vlvt_loader.dart';

/// Reason enum matching backend
/// Valid values: 'inappropriate', 'harassment', 'spam', 'underage', 'other'
enum ReportReason {
  inappropriate('inappropriate', 'Inappropriate Content'),
  harassment('harassment', 'Harassment'),
  spam('spam', 'Spam'),
  underage('underage', 'Underage User'),
  other('other', 'Other');

  final String value;
  final String label;
  const ReportReason(this.value, this.label);
}

/// One-tap report dialog for After Hours
///
/// Features:
/// - Reason selection via chips (required)
/// - Optional details text field
/// - "Report & Exit" button disabled until reason selected
/// - Loading state during submission
/// - Auto-closes on success
class QuickReportDialog extends StatefulWidget {
  final String matchId;
  final Future<void> Function(String reason, String? details) onReport;

  const QuickReportDialog({
    super.key,
    required this.matchId,
    required this.onReport,
  });

  @override
  State<QuickReportDialog> createState() => _QuickReportDialogState();
}

class _QuickReportDialogState extends State<QuickReportDialog> {
  ReportReason? _selectedReason;
  final _detailsController = TextEditingController();
  bool _isSubmitting = false;

  @override
  void dispose() {
    _detailsController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_selectedReason == null) return;

    setState(() => _isSubmitting = true);

    try {
      await widget.onReport(
        _selectedReason!.value,
        _detailsController.text.isEmpty ? null : _detailsController.text,
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      setState(() => _isSubmitting = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to submit report: ${ErrorHandler.getShortMessage(e)}')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Report User'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Select a reason for reporting:',
              style: TextStyle(fontWeight: FontWeight.w500),
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: ReportReason.values.map((reason) {
                final isSelected = _selectedReason == reason;
                return ChoiceChip(
                  label: Text(reason.label),
                  selected: isSelected,
                  onSelected: _isSubmitting
                      ? null
                      : (selected) {
                          setState(
                              () => _selectedReason = selected ? reason : null);
                        },
                );
              }).toList(),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _detailsController,
              enabled: !_isSubmitting,
              decoration: const InputDecoration(
                labelText: 'Additional details (optional)',
                hintText: 'Describe what happened...',
                border: OutlineInputBorder(),
              ),
              maxLines: 3,
              maxLength: 500,
            ),
            const SizedBox(height: 8),
            const Text(
              'This will block the user and end the chat.',
              style: TextStyle(
                color: VlvtColors.textMuted,
                fontSize: 12,
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed:
              _isSubmitting ? null : () => Navigator.of(context).pop(false),
          child: const Text('Cancel'),
        ),
        ElevatedButton(
          onPressed:
              _isSubmitting || _selectedReason == null ? null : _submit,
          style: ElevatedButton.styleFrom(
            backgroundColor: VlvtColors.error,
            foregroundColor: VlvtColors.textPrimary,
          ),
          child: _isSubmitting
              ? const VlvtProgressIndicator(size: 20, strokeWidth: 2)
              : const Text('Report & Exit'),
        ),
      ],
    );
  }
}

/// Helper function to show the report dialog
///
/// Returns true if user submitted report, false if cancelled
Future<bool?> showQuickReportDialog(
  BuildContext context, {
  required String matchId,
  required Future<void> Function(String reason, String? details) onReport,
}) {
  return showDialog<bool>(
    context: context,
    barrierDismissible: false,
    builder: (context) => QuickReportDialog(
      matchId: matchId,
      onReport: onReport,
    ),
  );
}

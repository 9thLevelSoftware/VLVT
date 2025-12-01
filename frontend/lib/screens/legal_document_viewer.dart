import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import '../widgets/vlvt_button.dart';

enum LegalDocumentType {
  termsOfService,
  privacyPolicy,
}

class LegalDocumentViewer extends StatefulWidget {
  final LegalDocumentType documentType;

  const LegalDocumentViewer({
    super.key,
    required this.documentType,
  });

  @override
  State<LegalDocumentViewer> createState() => _LegalDocumentViewerState();
}

class _LegalDocumentViewerState extends State<LegalDocumentViewer> {
  String _content = '';
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadDocument();
  }

  Future<void> _loadDocument() async {
    try {
      final String path = widget.documentType == LegalDocumentType.termsOfService
          ? 'assets/legal/terms_of_service.md'
          : 'assets/legal/privacy_policy.md';

      final String content = await rootBundle.loadString(path);

      setState(() {
        _content = content;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Failed to load document: $e';
        _isLoading = false;
      });
    }
  }

  String get _title {
    return widget.documentType == LegalDocumentType.termsOfService
        ? 'Terms of Service'
        : 'Privacy Policy';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_title),
        elevation: 0,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24.0),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(
                          Icons.error_outline,
                          size: 64,
                          color: Colors.red,
                        ),
                        const SizedBox(height: 16),
                        Text(
                          _error!,
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 16),
                        ),
                        const SizedBox(height: 24),
                        VlvtButton.primary(
                          label: 'Retry',
                          onPressed: _loadDocument,
                        ),
                      ],
                    ),
                  ),
                )
              : Markdown(
                  data: _content,
                  selectable: true,
                  styleSheet: MarkdownStyleSheet(
                    h1: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                      height: 1.5,
                    ),
                    h2: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      height: 1.4,
                    ),
                    h3: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                      height: 1.3,
                    ),
                    p: const TextStyle(
                      fontSize: 14,
                      height: 1.6,
                    ),
                    listBullet: const TextStyle(
                      fontSize: 14,
                      height: 1.4,
                    ),
                    blockSpacing: 12.0,
                    listIndent: 24.0,
                  ),
                  padding: const EdgeInsets.all(16),
                ),
    );
  }
}

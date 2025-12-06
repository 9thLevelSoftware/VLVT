import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:camera/camera.dart';
import 'package:path_provider/path_provider.dart';
import '../services/verification_service.dart';
import '../theme/vlvt_colors.dart';
import '../theme/vlvt_text_styles.dart';
import '../widgets/vlvt_button.dart';

class VerificationScreen extends StatefulWidget {
  const VerificationScreen({super.key});

  @override
  State<VerificationScreen> createState() => _VerificationScreenState();
}

class _VerificationScreenState extends State<VerificationScreen> {
  CameraController? _cameraController;
  List<CameraDescription>? _cameras;
  bool _isCameraReady = false;
  bool _isCapturing = false;
  bool _showCountdown = false;
  int _countdownValue = 5;
  Timer? _countdownTimer;
  GesturePrompt? _prompt;
  String? _capturedImagePath;
  bool _isSubmitting = false;
  String? _resultMessage;
  bool? _verificationResult;

  @override
  void initState() {
    super.initState();
    _initializeCamera();
    _loadPrompt();
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    _cameraController?.dispose();
    super.dispose();
  }

  Future<void> _initializeCamera() async {
    try {
      _cameras = await availableCameras();
      if (_cameras == null || _cameras!.isEmpty) {
        return;
      }

      // Find front camera
      final frontCamera = _cameras!.firstWhere(
        (camera) => camera.lensDirection == CameraLensDirection.front,
        orElse: () => _cameras!.first,
      );

      _cameraController = CameraController(
        frontCamera,
        ResolutionPreset.high,
        enableAudio: false,
      );

      await _cameraController!.initialize();

      if (mounted) {
        setState(() {
          _isCameraReady = true;
        });
      }
    } catch (e) {
      debugPrint('Error initializing camera: $e');
    }
  }

  Future<void> _loadPrompt() async {
    final verificationService = context.read<VerificationService>();
    final prompt = await verificationService.getPrompt();
    if (mounted) {
      setState(() {
        _prompt = prompt;
      });
    }
  }

  void _startCapture() {
    if (_prompt == null || !_isCameraReady) return;

    setState(() {
      _showCountdown = true;
      _countdownValue = _prompt!.timeLimit;
    });

    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (_countdownValue > 1) {
        setState(() {
          _countdownValue--;
        });
      } else {
        timer.cancel();
        _capturePhoto();
      }
    });
  }

  Future<void> _capturePhoto() async {
    if (_cameraController == null || _isCapturing) return;

    setState(() {
      _isCapturing = true;
      _showCountdown = false;
    });

    try {
      final image = await _cameraController!.takePicture();

      // Save to temp directory
      final tempDir = await getTemporaryDirectory();
      final tempPath = '${tempDir.path}/verification_selfie.jpg';
      await File(image.path).copy(tempPath);

      setState(() {
        _capturedImagePath = tempPath;
        _isCapturing = false;
      });
    } catch (e) {
      debugPrint('Error capturing photo: $e');
      setState(() {
        _isCapturing = false;
      });
    }
  }

  void _retakePhoto() {
    setState(() {
      _capturedImagePath = null;
      _resultMessage = null;
      _verificationResult = null;
    });
    _loadPrompt();
  }

  Future<void> _submitVerification() async {
    if (_capturedImagePath == null || _prompt == null) return;

    setState(() {
      _isSubmitting = true;
    });

    final verificationService = context.read<VerificationService>();
    final result = await verificationService.submitVerification(
      selfieFile: File(_capturedImagePath!),
      gesturePrompt: _prompt!.id,
    );

    if (mounted) {
      setState(() {
        _isSubmitting = false;
        _verificationResult = result['verified'] as bool? ?? false;
        _resultMessage = result['message'] as String? ?? 'Verification complete';
      });

      if (_verificationResult == true) {
        // Show success and pop after delay
        await Future.delayed(const Duration(seconds: 2));
        if (mounted) {
          Navigator.of(context).pop(true);
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: VlvtColors.background,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.close, color: VlvtColors.textPrimary),
          onPressed: () => Navigator.of(context).pop(false),
        ),
        title: Text(
          'Get Verified',
          style: VlvtTextStyles.h3.copyWith(color: VlvtColors.textPrimary),
        ),
        centerTitle: true,
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Camera preview or captured image
            Expanded(
              child: Container(
                margin: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: VlvtColors.surface,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: _verificationResult == true
                        ? VlvtColors.success
                        : _verificationResult == false
                            ? VlvtColors.error
                            : VlvtColors.gold,
                    width: 3,
                  ),
                ),
                clipBehavior: Clip.antiAlias,
                child: _buildCameraContent(),
              ),
            ),

            // Instructions and controls
            Container(
              padding: const EdgeInsets.all(24),
              child: _buildControls(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCameraContent() {
    // Show result
    if (_resultMessage != null) {
      return Stack(
        fit: StackFit.expand,
        children: [
          if (_capturedImagePath != null)
            Image.file(
              File(_capturedImagePath!),
              fit: BoxFit.cover,
            ),
          Container(
            color: Colors.black.withValues(alpha: 0.7),
            child: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    _verificationResult == true
                        ? Icons.check_circle
                        : Icons.cancel,
                    size: 80,
                    color: _verificationResult == true
                        ? VlvtColors.success
                        : VlvtColors.error,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    _verificationResult == true ? 'Verified!' : 'Not Verified',
                    style: VlvtTextStyles.h1.copyWith(
                      color: _verificationResult == true
                          ? VlvtColors.success
                          : VlvtColors.error,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 32),
                    child: Text(
                      _resultMessage!,
                      style: VlvtTextStyles.bodyMedium.copyWith(
                        color: VlvtColors.textSecondary,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      );
    }

    // Show captured image for review
    if (_capturedImagePath != null) {
      return Stack(
        fit: StackFit.expand,
        children: [
          Image.file(
            File(_capturedImagePath!),
            fit: BoxFit.cover,
          ),
          Positioned(
            bottom: 16,
            left: 16,
            right: 16,
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.7),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                'Review your photo',
                style: VlvtTextStyles.bodyMedium.copyWith(color: Colors.white),
                textAlign: TextAlign.center,
              ),
            ),
          ),
        ],
      );
    }

    // Show camera preview
    if (!_isCameraReady || _cameraController == null) {
      return const Center(
        child: CircularProgressIndicator(color: VlvtColors.gold),
      );
    }

    return Stack(
      fit: StackFit.expand,
      children: [
        // Camera preview
        ClipRRect(
          borderRadius: BorderRadius.circular(17),
          child: CameraPreview(_cameraController!),
        ),

        // Countdown overlay
        if (_showCountdown)
          Container(
            color: Colors.black.withValues(alpha: 0.5),
            child: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    '$_countdownValue',
                    style: VlvtTextStyles.h1.copyWith(
                      fontSize: 120,
                      color: VlvtColors.gold,
                    ),
                  ),
                  const SizedBox(height: 16),
                  if (_prompt != null)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 24,
                        vertical: 12,
                      ),
                      decoration: BoxDecoration(
                        color: VlvtColors.gold,
                        borderRadius: BorderRadius.circular(30),
                      ),
                      child: Text(
                        _prompt!.instruction,
                        style: VlvtTextStyles.h3.copyWith(color: Colors.black),
                      ),
                    ),
                ],
              ),
            ),
          ),

        // Gesture instruction (when not in countdown)
        if (!_showCountdown && _prompt != null)
          Positioned(
            bottom: 16,
            left: 16,
            right: 16,
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.7),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                children: [
                  Text(
                    'When you tap Start, you\'ll have ${_prompt!.timeLimit} seconds to:',
                    style: VlvtTextStyles.caption.copyWith(
                      color: VlvtColors.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _prompt!.instruction,
                    style: VlvtTextStyles.h3.copyWith(color: VlvtColors.gold),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ),

        // Capturing indicator
        if (_isCapturing)
          Container(
            color: Colors.black.withValues(alpha: 0.5),
            child: const Center(
              child: CircularProgressIndicator(color: VlvtColors.gold),
            ),
          ),
      ],
    );
  }

  Widget _buildControls() {
    // Show retry button after failed verification
    if (_verificationResult == false) {
      return Column(
        children: [
          VlvtButton.primary(
            label: 'Try Again',
            onPressed: _retakePhoto,
            icon: Icons.refresh,
            expanded: true,
          ),
          const SizedBox(height: 12),
          VlvtButton.secondary(
            label: 'Cancel',
            onPressed: () => Navigator.of(context).pop(false),
            expanded: true,
          ),
        ],
      );
    }

    // Show submit/retake for captured image
    if (_capturedImagePath != null) {
      return Column(
        children: [
          VlvtButton.primary(
            label: _isSubmitting ? 'Verifying...' : 'Submit for Verification',
            onPressed: _isSubmitting ? null : _submitVerification,
            icon: Icons.verified_user,
            expanded: true,
          ),
          const SizedBox(height: 12),
          VlvtButton.secondary(
            label: 'Retake Photo',
            onPressed: _isSubmitting ? null : _retakePhoto,
            icon: Icons.refresh,
            expanded: true,
          ),
        ],
      );
    }

    // Show start capture button
    return Column(
      children: [
        if (_prompt == null)
          const CircularProgressIndicator(color: VlvtColors.gold)
        else
          VlvtButton.primary(
            label: 'Start Verification',
            onPressed: _showCountdown ? null : _startCapture,
            icon: Icons.camera_alt,
            expanded: true,
          ),
        const SizedBox(height: 16),
        Text(
          'We\'ll compare your selfie with your profile photo to verify your identity.',
          style: VlvtTextStyles.caption.copyWith(color: VlvtColors.textMuted),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}

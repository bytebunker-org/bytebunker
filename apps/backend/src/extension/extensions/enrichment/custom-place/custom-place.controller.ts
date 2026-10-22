import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CustomPlaceService } from './custom-place.service.js';
import {
    CreateCustomPlaceDto,
    CustomPlaceApplyResultDto,
    CustomPlaceDto,
    CustomPlaceSuggestionDto,
    UpdateCustomPlaceDto,
} from './dto/custom-place.dto.js';

@Controller('custom-places')
export class CustomPlaceController {
    constructor(private readonly customPlaceService: CustomPlaceService) {}

    @Get()
    @ApiOperation({ summary: 'All custom places' })
    @ApiResponse({ status: 200, type: [CustomPlaceDto] })
    public findAll(): Promise<CustomPlaceDto[]> {
        return this.customPlaceService.findAll();
    }

    @Get('suggestions')
    @ApiOperation({
        summary:
            'The 25 most visited canonical places no custom place covers yet, with their current name and the ' +
            'home/work role inferred from HOME_DURING / WORK_DURING periods',
    })
    @ApiResponse({ status: 200, type: [CustomPlaceSuggestionDto] })
    public suggestions(): Promise<CustomPlaceSuggestionDto[]> {
        return this.customPlaceService.suggestions();
    }

    @Post('apply')
    @ApiOperation({
        summary:
            'Run the place enrichment blueprint (enrichment/places) now so custom places take effect before the ' +
            'nightly run. Skipped while it is still running.',
    })
    @ApiResponse({ status: 201, type: CustomPlaceApplyResultDto })
    @ApiResponse({ status: 404, description: 'The blueprint is not installed' })
    public apply(): Promise<CustomPlaceApplyResultDto> {
        return this.customPlaceService.apply();
    }

    @Get(':id')
    @ApiOperation({ summary: 'One custom place' })
    @ApiResponse({ status: 200, type: CustomPlaceDto })
    public findOne(@Param('id', ParseIntPipe) id: number): Promise<CustomPlaceDto> {
        return this.customPlaceService.findOne(id);
    }

    @Post()
    @ApiOperation({ summary: 'Create a custom place' })
    @ApiResponse({ status: 201, type: CustomPlaceDto })
    public create(@Body() data: CreateCustomPlaceDto): Promise<CustomPlaceDto> {
        return this.customPlaceService.create(data);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Update a custom place' })
    @ApiResponse({ status: 200, type: CustomPlaceDto })
    public update(@Param('id', ParseIntPipe) id: number, @Body() data: UpdateCustomPlaceDto): Promise<CustomPlaceDto> {
        return this.customPlaceService.update(id, data);
    }

    @Delete(':id')
    @HttpCode(204)
    @ApiOperation({ summary: 'Delete a custom place; the graph follows at the next run of the places blueprint' })
    @ApiResponse({ status: 204, description: 'Deleted' })
    public async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
        await this.customPlaceService.remove(id);
    }
}
